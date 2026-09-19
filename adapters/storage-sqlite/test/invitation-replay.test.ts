import { expect, test } from "bun:test";
import {
  Assignment,
  AssignmentFacts,
  AssignmentProjection,
  Grant,
  RoleProjection,
} from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import {
  InvitationApplication,
  InvitationProjection,
  Member,
  MemberApplication,
  MemberFacts,
  MemberPermissions,
  MemberProjection,
  Workspace,
  WorkspaceFacts,
  WorkspaceInitialization,
  WorkspaceProjection,
} from "@amends/core/workspace";
import { Context, DateTime, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Operations } from "./operations.ts";

import {
  alice,
  bob,
  charlie,
  core,
  runHost,
  temporary,
  scope,
  request,
  future,
  boundTo,
  at,
} from "./invitation-support.ts";
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
              key.name === InvitationProjection.definition.name && cursor.index === 2
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
              key.name === InvitationProjection.definition.name && cursor.index === 2
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
            yield* sql`DELETE FROM checkpoints WHERE workspace_id = ${workspace.id} AND name IN (${MemberProjection.definition.name}, ${InvitationProjection.definition.name})`;
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
            WorkspaceProjection.definition,
            MemberProjection.definition,
            RoleProjection.definition,
            AssignmentProjection.definition,
          ],
        });
        yield* Effect.gen(function* () {
          const journal = yield* legacy;
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(WorkspaceFacts.Initialized, {
                id: workspaceId,
                createdBy: alice.id,
                name: "Test workspace",
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
