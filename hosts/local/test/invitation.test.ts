import { expect, expectTypeOf, test } from "bun:test";
import {
  Actor,
  Assignment,
  AssignmentFacts,
  AssignmentProjection,
  Checkpoint,
  Grant,
  Identity,
  Invitation,
  InvitationApplication,
  InvitationJournal,
  InvitationPermissions,
  Journal,
  Log,
  Member,
  MemberFacts,
  MemberPermissions,
  MemberProjection,
  Permission,
  RoleProjection,
  Scope,
  Store,
  Workspace,
  WorkspaceCore,
  WorkspaceInitialization,
} from "@amends/core";
import { BunCrypto } from "@effect/platform-bun";
import { Clock, Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.ts";
import { LocalHost } from "../src/host.ts";
import { Storage } from "../src/storage.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const charlie = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("charlie") });
type Bound = Effect.Success<
  ReturnType<Effect.Success<ReturnType<typeof Storage.make>>["forWorkspace"]>
>;
const core = (bound: Bound) =>
  WorkspaceCore.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
const runHost = <A, E>(
  filename: string,
  program: Effect.Effect<A, E, LocalHost.Service | SqlClient.SqlClient>,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(
        Layer.effect(LocalHost.Service, LocalHost.make()).pipe(
          Layer.provideMerge(Layer.mergeAll(Database.layer(filename), BunCrypto.layer)),
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
  return yield* (yield* Storage.make()).forWorkspace(workspaceId);
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const invitation = yield* host.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        const bound = yield* boundTo(workspace.id);
        expect(yield* bound.members.findActive(bob)).toEqual(Option.none());
        const accepted = yield* Effect.forEach(
          [1, 2],
          () => host.acceptInvitation(workspace.id, bob.id, invitation.details.id),
          { concurrency: "unbounded" },
        );
        const first = accepted[0];
        if (first === undefined) throw new Error("Missing acceptance");
        expect(accepted[1]?.id).toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(first.id)).toHaveLength(1);
        expect(
          (yield* host.getMember(workspace.id, bob, workspace.ownerMemberId)).identity,
        ).toEqual(alice);
        expect(
          yield* Effect.flip(
            host.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(yield* Effect.flip(host.enableInvitations(workspace.id, bob))).toMatchObject({
          _tag: "WorkspaceInitialization.NotOwner",
        });
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(before).toHaveLength(3);
        expect(before[2]?.entries).toHaveLength(3);
        yield* host.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        // Exercise receipt behavior after a later membership lifecycle change.
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(MemberFacts.Removed, { workspaceId: workspace.id, memberId: first.id }),
        ).pipe(Effect.provide(core(bound)));
        expect(
          (yield* host.acceptInvitation(workspace.id, bob.id, invitation.details.id)).status,
        ).toBe("removed");
        expect(
          yield* Effect.flip(host.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "LocalHost.NotMember" });
        const freshInvite = yield* host.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [],
        });
        const rejoined = yield* host.acceptInvitation(workspace.id, bob.id, freshInvite.details.id);
        expect(rejoined.id).not.toBe(first.id);
        expect(yield* bound.assignments.listActiveByMember(rejoined.id)).toEqual([]);
        expect(
          yield* Effect.flip(host.getMember(workspace.id, bob, workspace.ownerMemberId)),
        ).toMatchObject({ _tag: "Authorization.Denied" });
      }),
    );
  }));

test("recipient identity and workspace binding protect pending and accepted invitations", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const host = yield* LocalHost.Service;
        const a = yield* host.createWorkspace(alice.id);
        const b = yield* host.createWorkspace(charlie.id);
        const invitation = yield* host.invite(a.id, alice, request(a.id, yield* future));
        const bound = yield* boundTo(a.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        expect(
          yield* Effect.flip(host.acceptInvitation(a.id, charlie.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
        expect(
          yield* Effect.flip(host.acceptInvitation(b.id, bob.id, invitation.details.id)),
        ).toMatchObject({ _tag: "InvitationApplication.NotFound" });
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        yield* host.acceptInvitation(a.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(host.acceptInvitation(a.id, charlie.id, invitation.details.id)),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const now = yield* DateTime.now;
        const expiresAt = DateTime.add(now, { seconds: 30 });
        expect(
          yield* at(now, Effect.flip(host.invite(workspace.id, alice, request(workspace.id, now)))),
        ).toMatchObject({ _tag: "InvitationApplication.InvalidExpiry" });
        const invitation = yield* at(
          now,
          host.invite(workspace.id, alice, request(workspace.id, expiresAt)),
        );
        expect(
          yield* at(
            expiresAt,
            Effect.flip(host.acceptInvitation(workspace.id, bob.id, invitation.details.id)),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "expired" });
        expect(yield* (yield* boundTo(workspace.id)).members.findActive(bob)).toEqual(
          Option.none(),
        );
        const revoked = yield* at(
          expiresAt,
          host.revokeInvitation(workspace.id, alice, invitation.details.id),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const invitation = yield* host.invite(
          workspace.id,
          alice,
          request(workspace.id, yield* future),
        );
        yield* host.revokeInvitation(workspace.id, alice, invitation.details.id);
        const bound = yield* boundTo(workspace.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        yield* host.revokeInvitation(workspace.id, alice, invitation.details.id);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        return { workspace, invitation };
      }),
    );
    await runHost(
      filename,
      Effect.gen(function* () {
        const host = yield* LocalHost.Service;
        expect(
          yield* Effect.flip(
            host.acceptInvitation(saved.workspace.id, bob.id, saved.invitation.details.id),
          ),
        ).toMatchObject({ _tag: "InvitationApplication.Unavailable", reason: "revoked" });
        const replacement = yield* host.invite(
          saved.workspace.id,
          alice,
          request(saved.workspace.id, yield* future),
        );
        yield* host.acceptInvitation(saved.workspace.id, bob.id, replacement.details.id);
        expect(
          yield* Effect.flip(
            host.revokeInvitation(saved.workspace.id, alice, replacement.details.id),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const invitation = yield* host.invite(workspace.id, alice, {
          recipientId: bob.id,
          expiresAt: yield* future,
          grants: [Grant.make(InvitationPermissions.Manage, scope(workspace.id))],
        });
        yield* host.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        expect(
          yield* Effect.flip(
            host.invite(workspace.id, bob, request(workspace.id, yield* future, charlie.id)),
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
        const host = yield* LocalHost.Service;
        for (const change of ["permission", "membership", "ownership"] as const) {
          const workspace = yield* host.createWorkspace(alice.id);
          const invitation = yield* host.invite(
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
            yield* host.enableInvitations(workspace.id, alice);
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
            host.acceptInvitation(workspace.id, bob.id, invitation.details.id),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
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
            host.invite(workspace.id, alice, {
              recipientId: bob.id,
              grants: [grant],
              expiresAt: yield* future,
            }),
          );
          expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        }
        expect(
          yield* Effect.flip(
            host.invite(workspace.id, alice, request(workspace.id, yield* future, alice.id)),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const a = yield* host.invite(workspace.id, alice, request(workspace.id, yield* future));
        const b = yield* host.invite(workspace.id, alice, request(workspace.id, yield* future));
        const results = yield* Effect.forEach(
          [a, b],
          (invitation) =>
            host.acceptInvitation(workspace.id, bob.id, invitation.details.id).pipe(Effect.result),
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const invitation = yield* host.invite(
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
        yield* host.acceptInvitation(workspace.id, bob.id, invitation.details.id);
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
        const host = yield* LocalHost.Service;
        expect(
          yield* Effect.flip(host.invite(workspaceId, alice, request(workspaceId, yield* future))),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        yield* host.enableInvitations(workspaceId, alice);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        yield* host.enableInvitations(workspaceId, alice);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        const invitation = yield* host.invite(
          workspaceId,
          alice,
          request(workspaceId, yield* future),
        );
        yield* host.acceptInvitation(workspaceId, bob.id, invitation.details.id);
        expect(yield* bound.assignments.listActiveByMember(memberId)).toHaveLength(3);
      }),
    );
  }));

test("exact-target grants remain limited to that member after acceptance", async () =>
  temporary(async (filename) => {
    await runHost(
      filename,
      Effect.gen(function* () {
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const invitation = yield* host.invite(workspace.id, alice, {
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
        const member = yield* host.acceptInvitation(workspace.id, bob.id, invitation.details.id);
        yield* host.getMember(workspace.id, bob, workspace.ownerMemberId);
        expect(yield* Effect.flip(host.getMember(workspace.id, bob, member.id))).toMatchObject({
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
        const host = yield* LocalHost.Service;
        const workspace = yield* host.createWorkspace(alice.id);
        const expiresAt = yield* future;
        const accepted = yield* host.invite(workspace.id, alice, request(workspace.id, expiresAt));
        const member = yield* host.acceptInvitation(workspace.id, bob.id, accepted.details.id);
        const revoked = yield* host.invite(
          workspace.id,
          alice,
          request(workspace.id, expiresAt, charlie.id),
        );
        yield* host.revokeInvitation(workspace.id, alice, revoked.details.id);
        const pending = yield* host.invite(
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
            host.acceptInvitation(workspace.id, bob.id, accepted.details.id),
          ),
        ).toEqual(member);
      }),
    );
  }));

test("CLI invitation, acceptance, and revocation survive separate process invocations", async () =>
  temporary(async (filename) => {
    const invoke = async (...args: string[]) => {
      const child = Bun.spawn([process.execPath, "hosts/local/src/index.ts", ...args], {
        cwd: join(import.meta.dir, "../../.."),
        env: { ...process.env, AMENDS_DATABASE: filename },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exit, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, output, error };
    };
    const created = await invoke("create", alice.id);
    expect(created.exit).toBe(0);
    const workspace = Schema.decodeSync(Schema.fromJsonString(Workspace.Record))(
      created.output.trim(),
    );
    const expiry = DateTime.formatIso(DateTime.add(DateTime.nowUnsafe(), { hours: 1 }));
    const issued = await invoke("invite", workspace.id, alice.id, bob.id, expiry);
    expect(issued.exit).toBe(0);
    const invitation = Schema.decodeSync(Schema.fromJsonString(Invitation.Record))(
      issued.output.trim(),
    );
    expect((await invoke("accept", workspace.id, charlie.id, invitation.details.id)).exit).toBe(1);
    const accepted = await invoke("accept", workspace.id, bob.id, invitation.details.id);
    expect(accepted.exit).toBe(0);
    const member = Schema.decodeSync(Schema.fromJsonString(Member.Record))(accepted.output.trim());
    expect((await invoke("get", workspace.id, bob.id, workspace.ownerMemberId)).exit).toBe(0);
    expect((await invoke("accept", workspace.id, bob.id, invitation.details.id)).output).toBe(
      accepted.output,
    );
    const issuedAgain = await invoke("invite", workspace.id, alice.id, charlie.id, expiry, "-");
    expect(issuedAgain.exit).toBe(0);
    const second = Schema.decodeSync(Schema.fromJsonString(Invitation.Record))(
      issuedAgain.output.trim(),
    );
    expect((await invoke("revoke", workspace.id, alice.id, second.details.id)).exit).toBe(0);
    expect((await invoke("accept", workspace.id, charlie.id, second.details.id)).exit).toBe(1);
    expect(member.identity).toEqual(bob);
  }));
