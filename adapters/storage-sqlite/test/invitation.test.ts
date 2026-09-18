import { expect, expectTypeOf, test } from "bun:test";
import * as Core from "@amends/core";
import {
  Assignment,
  AssignmentFacts,
  AssignmentProjection,
  AssignmentStore,
  Grant,
  Permission,
  RoleProjection,
  RoleStore,
  Scope,
} from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import {
  Invitation,
  InvitationApplication,
  InvitationJournal,
  InvitationPermissions,
  InvitationStore,
  Member,
  MemberApplication,
  MemberFacts,
  MemberPermissions,
  MemberProjection,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, type WorkspaceStorage } from "@amends/gateway";
import { contracts, SqliteDatabase, SqliteStorage } from "../src/index.ts";
import { BunCrypto } from "@effect/platform-bun";
import { Clock, Context, DateTime, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Operations } from "./operations.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const charlie = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") });
/** The bound stores by name, for direct assertions beside the context core receives. */
const bind = (context: Context.Context<WorkspaceStorage.Bindings>) => ({
  context,
  store: Context.get(context, Store.Service),
  checkpoints: Context.get(context, Checkpoint.Service),
  workspace: Context.get(context, WorkspaceStore.Service),
  members: Context.get(context, MemberStore.Service),
  roles: Context.get(context, RoleStore.Service),
  assignments: Context.get(context, AssignmentStore.Service),
  invitations: Context.get(context, InvitationStore.Service),
});
type Bound = ReturnType<typeof bind>;
const views = Effect.map(SqliteStorage.make(), (service) => ({
  forWorkspace: (workspaceId: Workspace.Id) => Effect.map(service.forWorkspace(workspaceId), bind),
}));
const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
const runHost = <A, E>(
  filename: string,
  program: Effect.Effect<A, E, Gateway.Service | SqliteDatabase.Service | SqlClient.SqlClient>,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(
        Gateway.layer.pipe(
          Layer.provideMerge(contracts),
          Layer.provideMerge(Layer.mergeAll(SqliteDatabase.layer(filename), BunCrypto.layer)),
        ),
      ),
    ),
  );
const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-invitation-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
const scope = (workspaceId: Workspace.Id) => Scope.Value.cases.Workspace.make({ workspaceId });
const request = (
  workspaceId: Workspace.Id,
  expiresAt: DateTime.Utc,
  recipientId = bob.id,
): Invitation.Request => ({
  recipientId,
  expiresAt,
  grants: [Grant.make(MemberPermissions.Read, scope(workspaceId))],
});
const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));
const boundTo = Effect.fnUntraced(function* (workspaceId: Workspace.Id) {
  return yield* (yield* views).forWorkspace(workspaceId);
});
const at = <A, E, R>(time: DateTime.Utc, program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((clock) =>
    program.pipe(
      Effect.provideService(Clock.Clock, {
        currentTimeMillis: Effect.succeed(DateTime.toEpochMillis(time)),
        currentTimeMillisUnsafe: () => DateTime.toEpochMillis(time),
        currentTimeNanos: Effect.succeed(BigInt(DateTime.toEpochMillis(time)) * 1_000_000n),
        currentTimeNanosUnsafe: () => BigInt(DateTime.toEpochMillis(time)) * 1_000_000n,
        monotonicTimeNanos: clock.monotonicTimeNanos,
        monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
        sleep: (duration) => clock.sleep(duration),
      }),
    ),
  );

test("owner invites a reader; concurrent repeat acceptance grants once and never reactivates removed membership", async () =>
  temporary(async (filename) => {
    expectTypeOf<
      Effect.Services<ReturnType<InvitationApplication.Interface["accept"]>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<InvitationApplication.Interface["issue"]>>
    >().toEqualTypeOf<Actor.Service>();
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const bound = yield* boundTo(workspace.id);
        expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
        const accepted = yield* Effect.forEach(
          [1, 2],
          () => Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
          { concurrency: "unbounded" },
        );
        const first = accepted[0];
        if (first === undefined) throw new Error("Missing acceptance");
        expect(accepted[1]?.id).toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(first.id)).toHaveLength(1);
        expect(
          (yield* Operations.getMember(workspace.id, bob, workspace.ownerMemberId)).identity,
        ).toEqual(alice);
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(yield* Effect.flip(Operations.enableInvitations(workspace.id, bob))).toMatchObject({
          _tag: "WorkspaceInitialization.NotOwner",
        });
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(before).toHaveLength(3);
        expect(before[2]?.entries).toHaveLength(3);
        yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        yield* Operations.removeMember(workspace.id, alice, first.id);
        expect(
          (yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)).status,
        ).toBe("removed");
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "Gateway.NotMember" });
        const freshInvite = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [],
        });
        const rejoined = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          freshInvite.details.id,
        );
        expect(rejoined.id).not.toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(rejoined.id)).toEqual([]);
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "Authorization.Denied" });
      }),
    );
  }));

test("recipient identity and workspace binding protect pending and accepted invitations", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const a = yield* Operations.createWorkspace(alice.id);
        const b = yield* Operations.createWorkspace(charlie.id);
        const invitation = yield* Operations.invite(a.id, alice, request(a.id, yield* future));
        const bound = yield* boundTo(a.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(
          yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
        expect(
          yield* Effect.flip(Operations.acceptInvitation(b.id, bob.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotFound" });
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        yield* Operations.acceptInvitation(a.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(Operations.acceptInvitation(a.id, charlie.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
        expect(yield* (yield* boundTo(b.id)).members.findActive(bob)).toEqual(Option.none());
      }),
    );
  }));

test("expiry is checked against the operation clock, including the exact deadline", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const now = yield* DateTime.now;
        const expiresAt = DateTime.add(now, { seconds: 30 });
        expect(
          yield* at(
            now,
            Effect.flip(Operations.invite(workspace.id, alice, request(workspace.id, now))),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.InvalidExpiry" });
        const invitation = yield* at(
          now,
          Operations.invite(workspace.id, alice, request(workspace.id, expiresAt)),
        );
        expect(
          yield* at(
            expiresAt,
            Effect.flip(Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "expired" });
        expect(yield* (yield* boundTo(workspace.id)).members.findActive(bob)).toEqual(
          Option.none(),
        );
        const revoked = yield* at(
          expiresAt,
          Operations.revokeInvitation(workspace.id, alice, invitation.details.id),
        );
        expect(revoked.state._tag).toBe("Revoked");
      }),
    );
  }));

test("revocation is persistent and idempotent; accepted invitations cannot be revoked", async () =>
  temporary(async (filename) => {
    const saved = await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        yield* Operations.revokeInvitation(workspace.id, alice, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        return { workspace, invitation };
      }),
    );
    await runHost(
      filename,
      Effect.gen(function* () {
        expect(
          yield* Effect.flip(
            Operations.acceptInvitation(saved.workspace.id, bob.id, saved.invitation.details.id),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "revoked" });
        const replacement = yield* Operations.invite(
          saved.workspace.id,
          alice,
          request(saved.workspace.id, yield* future),
        );
        yield* Operations.acceptInvitation(saved.workspace.id, bob.id, replacement.details.id);
        expect(
          yield* Effect.flip(
            Operations.revokeInvitation(saved.workspace.id, alice, replacement.details.id),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "accepted" });
      }),
    );
  }));

test("holding invitation permission does not confer ownership-based grant authority", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [Grant.make(InvitationPermissions.Manage, scope(workspace.id))],
        });
        yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.NotOwner" });
      }),
    );
  }));

test("acceptance rechecks original inviter's permission, membership, and ownership", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        for (const change of ["permission", "membership", "ownership"] as const) {
          const workspace = yield* Operations.createWorkspace(alice.id);
          const invitation = yield* Operations.invite(
            workspace.id,
            alice,
            request(workspace.id, yield* future),
          );
          const bound = yield* boundTo(workspace.id);
          if (change === "permission") {
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(AssignmentFacts.Revoked, {
                workspaceId: workspace.id,
                assignmentId: WorkspaceInitialization.invitationAssignmentId(
                  workspace.ownerMemberId,
                ),
              }),
            ).pipe(Effect.provide(core(bound)));
            yield* Operations.enableInvitations(workspace.id, alice);
          } else if (change === "membership") {
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(MemberFacts.Removed, {
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
              }),
            ).pipe(Effect.provide(core(bound)));
          } else {
            const sql = yield* SqlClient.SqlClient;
            yield* sql`UPDATE workspaces SET record = json_set(record, '$.ownerMemberId', 'successor') WHERE workspace_id = ${workspace.id}`;
          }
          const failure = yield* Effect.flip(
            Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id),
          );
          expect(failure._tag).toBe(
            change === "permission"
              ? "Authorization.Denied"
              : change === "membership"
                ? "Authorization.InvalidActor"
                : "InvitationApplication.NotOwner",
          );
          expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
          expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
            _tag: "Some",
            value: { state: { _tag: "Pending" } },
          });
        }
      }),
    );
  }));

test("invalid grant names, target kinds, and foreign scopes never publish an invitation", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const invalid: ReadonlyArray<Grant.Value> = [
          { permission: Permission.Name.make("unknown.permission"), scope: scope(workspace.id) },
          { permission: MemberPermissions.Read.name, scope: scope(Workspace.Id.make("foreign")) },
          {
            permission: MemberPermissions.Read.name,
            scope: { _tag: "Target", target: { _tag: "Workspace", workspaceId: workspace.id } },
          },
        ];
        for (const grant of invalid) {
          yield* Effect.flip(
            Operations.invite(workspace.id, alice, {
              recipientId: bob.id,
              grants: [grant],
              expiresAt: yield* future,
            }),
          );
          expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        }
        expect(
          yield* Effect.flip(
            Operations.invite(workspace.id, alice, request(workspace.id, yield* future, alice.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.AlreadyMember" });
      }),
    );
  }));

test("competing invitations cannot create two active memberships or combine their grants", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const a = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const b = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const results = yield* Effect.forEach(
          [a, b],
          (invitation) =>
            Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id).pipe(
              Effect.result,
            ),
          { concurrency: "unbounded" },
        );
        expect(results.filter((value) => value._tag === "Success")).toHaveLength(1);
        const failure = results.find((value) => value._tag === "Failure");
        expect(failure).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "InvitationApplication.AlreadyMember" },
        });
        const bound = yield* boundTo(workspace.id);
        const member = yield* bound.members.findActive(bob);
        if (Option.isNone(member)) throw new Error("Missing member");
        expect(yield* bound.assignments.listActiveByMember(member.value.id)).toHaveLength(1);
      }),
    );
  }));

test("failed acceptance checkpoint rolls back membership, assignments, consumption, and journal together", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const error = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected failure after consumption",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              key.name === InvitationJournal.projection.name && cursor.index === 2
                ? Effect.fail(error)
                : bound.checkpoints.set(key, cursor),
          }),
        };
        const failure = yield* Effect.flatMap(InvitationApplication.Service, (service) =>
          service.accept(invitation.details.id, bob.id),
        ).pipe(Effect.provide(core(broken)), Effect.flip);
        expect(failure).toBe(error);
        expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
        expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
          _tag: "Some",
          value: { state: { _tag: "Pending" } },
        });
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        const sql = yield* SqlClient.SqlClient;
        expect(
          yield* sql`SELECT COUNT(*) AS count FROM assignments WHERE workspace_id = ${workspace.id}`,
        ).toEqual([{ count: 3 }]);
        yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
      }),
    );
  }));

test("removal and pending invitation revocation roll back together, commit once, and replay within their workspace", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const other = yield* Operations.createWorkspace(alice.id);
        const otherInvite = yield* Operations.invite(
          other.id,
          alice,
          request(other.id, yield* future),
        );
        const otherPending = yield* Operations.invite(
          other.id,
          alice,
          request(other.id, yield* future),
        );
        yield* Operations.acceptInvitation(other.id, bob.id, otherInvite.details.id);
        const invitation = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const expiresAt = yield* future;
        const pending = yield* Effect.forEach([1, 2], () =>
          Operations.invite(workspace.id, alice, request(workspace.id, expiresAt)),
        );
        const unrelated = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future, charlie.id),
        );
        const member = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          invitation.details.id,
        );
        const bound = yield* boundTo(workspace.id);
        const logId = Log.Id.make("journal");
        const before = yield* bound.store.read(logId, { limit: 20 });
        const sql = yield* SqlClient.SqlClient;
        const checkpoints =
          yield* sql`SELECT * FROM checkpoints WHERE workspace_id = ${workspace.id} ORDER BY name`;
        const grants = yield* bound.assignments.listActiveByMember(member.id);
        const error = new Store.Failure({
          operation: "checkpoint.set",
          cause: "failure after removal and pending invitation revocations",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              key.name === InvitationJournal.projection.name && cursor.index === 2
                ? Effect.fail(error)
                : bound.checkpoints.set(key, cursor),
          }),
        };
        const failure = yield* Effect.flatMap(MemberApplication.Service, (application) =>
          application.remove(member.id),
        ).pipe(
          Effect.provide(core(broken)),
          Effect.provideService(Actor.Service, {
            workspaceId: workspace.id,
            memberId: workspace.ownerMemberId,
            identity: alice,
          }),
          Effect.flip,
        );
        expect(failure).toBe(error);
        expect(yield* Operations.getMember(workspace.id, bob, member.id)).toEqual(member);
        expect(yield* bound.store.read(logId, { limit: 20 })).toEqual(before);
        for (const record of pending)
          expect(yield* bound.invitations.get(record.details.id)).toEqual(Option.some(record));
        expect(
          yield* sql`SELECT * FROM checkpoints WHERE workspace_id = ${workspace.id} ORDER BY name`,
        ).toEqual(checkpoints);
        // A member ID from another workspace cannot be addressed through this context.
        expect(
          yield* Effect.flip(Operations.removeMember(workspace.id, alice, other.ownerMemberId)),
        ).toMatchObject({ _tag: "MemberApplication.NotFound" });
        const results = yield* Effect.forEach(
          [1, 2],
          () => Operations.removeMember(workspace.id, alice, member.id).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
        expect(results.find((result) => result._tag === "Failure")).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "MemberApplication.AlreadyRemoved" },
        });
        const after = yield* bound.store.read(logId, { limit: 20 });
        expect(after).toHaveLength(before.length + 1);
        expect(after.at(-1)?.entries).toHaveLength(3);
        for (const record of pending) {
          expect(yield* bound.invitations.get(record.details.id)).toMatchObject({
            _tag: "Some",
            value: { state: { _tag: "Revoked", revokedBy: workspace.ownerMemberId } },
          });
          expect(
            yield* Effect.flip(
              Operations.acceptInvitation(workspace.id, bob.id, record.details.id),
            ),
          ).toMatchObject({
            _tag: "InvitationApplication.Unavailable",
            reason: "revoked",
          });
        }
        expect(yield* bound.invitations.get(unrelated.details.id)).toEqual(Option.some(unrelated));
        expect(yield* (yield* boundTo(other.id)).invitations.get(otherPending.details.id)).toEqual(
          Option.some(otherPending),
        );
        expect(yield* bound.assignments.listActiveByMember(member.id)).toEqual(grants);
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
        ).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect((yield* Operations.getMember(other.id, bob, other.ownerMemberId)).status).toBe(
          "active",
        );
        // Rebuild the affected read models from the recorded outcomes.
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM members WHERE workspace_id = ${workspace.id}`;
            yield* sql`DELETE FROM invitations WHERE workspace_id = ${workspace.id}`;
            yield* sql`DELETE FROM checkpoints WHERE workspace_id = ${workspace.id} AND name IN (${MemberProjection.definition.name}, ${InvitationJournal.projection.name})`;
          }),
        );
        expect(yield* Operations.getMember(workspace.id, alice, member.id)).toMatchObject({
          id: member.id,
          status: "removed",
        });
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
        ).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(yield* bound.store.read(logId, { limit: 20 })).toEqual(after);
        for (const record of pending)
          expect(
            yield* Effect.flip(
              Operations.acceptInvitation(workspace.id, bob.id, record.details.id),
            ),
          ).toMatchObject({
            _tag: "InvitationApplication.Unavailable",
            reason: "revoked",
          });
      }),
    );
  }));

test("old workspaces explicitly enable invitations once and catch up the new projection", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspaceId = Workspace.Id.make("legacy-workspace");
        const memberId = Member.Id.make("legacy-owner");
        const bound = yield* boundTo(workspaceId);
        const legacy = Journal.make({
          logId: Log.Id.make("journal"),
          projections: [
            WorkspaceInitialization.projection,
            MemberProjection.definition,
            RoleProjection.definition,
            AssignmentProjection.definition,
          ],
        });
        yield* Effect.gen(function* () {
          const journal = yield* legacy;
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(WorkspaceInitialization.Initialized, {
                id: workspaceId,
                createdBy: alice.id,
                ownerMemberId: memberId,
              });
              yield* journal.publish(MemberFacts.Added, { workspaceId, memberId, identity: alice });
              for (const permission of [MemberPermissions.Read, MemberPermissions.Remove])
                yield* journal.publish(AssignmentFacts.Created, {
                  workspaceId,
                  memberId,
                  assignmentId: Assignment.Id.make(permission.name),
                  source: { _tag: "Direct", grant: Grant.make(permission, scope(workspaceId)) },
                });
            }),
          );
        }).pipe(
          Effect.provide(Log.layer.pipe(Layer.provideMerge(Layer.succeedContext(bound.context)))),
        );
        expect(
          yield* Effect.flip(
            Operations.invite(workspaceId, alice, request(workspaceId, yield* future)),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        yield* Operations.enableInvitations(workspaceId, alice);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        yield* Operations.enableInvitations(workspaceId, alice);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        const invitation = yield* Operations.invite(
          workspaceId,
          alice,
          request(workspaceId, yield* future),
        );
        yield* Operations.acceptInvitation(workspaceId, bob.id, invitation.details.id);
        expect(yield* bound.assignments.listActiveByMember(memberId)).toHaveLength(3);
      }),
    );
  }));

test("exact-target grants remain limited to that member after acceptance", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const invitation = yield* Operations.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [
            Grant.make(MemberPermissions.Read, {
              _tag: "Target",
              target: {
                _tag: "Member",
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
              },
            }),
          ],
        });
        const member = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          invitation.details.id,
        );
        yield* Operations.getMember(workspace.id, bob, workspace.ownerMemberId);
        expect(
          yield* Effect.flip(Operations.getMember(workspace.id, bob, member.id)),
        ).toMatchObject({
          _tag: "Authorization.Denied",
        });
      }),
    );
  }));

test("invitation replay restores pending, accepted, and revoked records without rechecking time or authority", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const workspace = yield* Operations.createWorkspace(alice.id);
        const expiresAt = yield* future;
        const accepted = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, expiresAt),
        );
        const member = yield* Operations.acceptInvitation(
          workspace.id,
          bob.id,
          accepted.details.id,
        );
        const revoked = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, expiresAt, charlie.id),
        );
        yield* Operations.revokeInvitation(workspace.id, alice, revoked.details.id);
        const pending = yield* Operations.invite(
          workspace.id,
          alice,
          request(workspace.id, expiresAt, Identity.HumanId.make("pending")),
        );
        const bound = yield* boundTo(workspace.id);
        const records = yield* Effect.forEach([accepted, revoked, pending], (invitation) =>
          bound.invitations.get(invitation.details.id),
        );
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(AssignmentFacts.Revoked, {
            workspaceId: workspace.id,
            assignmentId: WorkspaceInitialization.invitationAssignmentId(workspace.ownerMemberId),
          }),
        ).pipe(Effect.provide(core(bound)));
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const sql = yield* SqlClient.SqlClient;
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM members`;
            yield* sql`DELETE FROM roles`;
            yield* sql`DELETE FROM assignments`;
            yield* sql`DELETE FROM invitations`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        yield* at(
          DateTime.add(expiresAt, { days: 1 }),
          Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
            Effect.provide(core(bound)),
          ),
        );
        expect(
          yield* Effect.forEach([accepted, revoked, pending], (invitation) =>
            bound.invitations.get(invitation.details.id),
          ),
        ).toEqual(records);
        expect(yield* bound.members.get(member.id)).toEqual(Option.some(member));
        expect(yield* bound.assignments.listActiveByMember(member.id)).toHaveLength(1);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        expect(
          yield* at(
            DateTime.add(expiresAt, { days: 1 }),
            Operations.acceptInvitation(workspace.id, bob.id, accepted.details.id),
          ),
        ).toEqual(member);
      }),
    );
  }));
