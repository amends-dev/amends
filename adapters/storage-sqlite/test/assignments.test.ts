import { expect, it } from "@effect/vitest";
import { AssignmentApplication, BuiltinRoles, Role } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Log, Store } from "@amends/core/journal";
import type { Gateway } from "@amends/gateway";
import { Context, Effect, Option } from "effect";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  charlie,
  temporary,
  runHost,
  boundTo,
  core,
  future,
  request,
} from "./invitation-support.ts";

const setup = Effect.gen(function* () {
  const workspace = yield* Operations.createWorkspace(alice.id);
  const invitation = yield* Operations.invite(
    workspace.id,
    alice,
    request(workspace.id, yield* future),
  );
  const viewer = yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  const adminInvite = yield* Operations.invite(
    workspace.id,
    alice,
    request(workspace.id, yield* future, charlie.id, BuiltinRoles.AdministratorId),
  );
  const admin = yield* Operations.acceptInvitation(
    workspace.id,
    charlie.id,
    adminInvite.details.id,
  );
  return { workspace, viewer, admin, bound: yield* boundTo(workspace.id) };
});
it.effect("assignments cannot be addressed through another workspace or recipient", () =>
  temporary((filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, viewer, admin, bound } = yield* setup;
        const other = yield* Operations.createWorkspace(alice.id);
        const otherBound = yield* boundTo(other.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const otherBefore = yield* otherBound.store.read(Log.Id.make("journal"), { limit: 20 });
        const first = (yield* bound.assignments.listActiveByMember(viewer.id))[0];
        if (first === undefined) throw new Error("Missing Viewer assignment");
        expect(
          yield* Effect.flip(
            Operations.assign(other.id, alice, {
              memberId: viewer.id,
              roleId: BuiltinRoles.ViewerId,
            }),
          ),
        ).toMatchObject({ _tag: "AssignmentApplication.MemberNotFound" });
        expect(yield* Effect.flip(Operations.access(other.id, bob, viewer.id))).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(
          yield* Effect.flip(Operations.revokeAssignment(workspace.id, alice, admin.id, first.id)),
        ).toMatchObject({ _tag: "AssignmentApplication.NotFound" });
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
        expect(yield* otherBound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(
          otherBefore,
        );
      }),
    ),
  ),
);

it.effect(
  "assignments are additive, duplicate assignment is idempotent, and role replacement is atomic",
  () =>
    temporary((filename) =>
      runHost(
        filename,
        Effect.gen(function* () {
          const { workspace, viewer, bound } = yield* setup;
          const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
          const duplicate = yield* Operations.assign(workspace.id, alice, {
            memberId: viewer.id,
            roleId: BuiltinRoles.ViewerId,
          });
          expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
          const admin = yield* Operations.assign(workspace.id, alice, {
            memberId: viewer.id,
            roleId: BuiltinRoles.AdministratorId,
          });
          expect(
            (yield* Operations.access(workspace.id, alice, viewer.id)).assignments,
          ).toHaveLength(2);
          yield* Operations.revokeAssignment(workspace.id, alice, viewer.id, duplicate.id);
          const access = yield* Operations.access(workspace.id, bob, workspace.ownerMemberId);
          expect(
            access.roles.filter(({ assignable }) => assignable).map(({ role }) => role.id),
          ).toEqual([BuiltinRoles.ViewerId]);
          const changed = yield* Operations.change(workspace.id, alice, {
            memberId: viewer.id,
            roleId: BuiltinRoles.ViewerId,
            expectedAssignmentIds: [admin.id],
          });
          expect(changed.id).not.toBe(admin.id);
          expect(yield* bound.assignments.get(admin.id)).toMatchObject({
            _tag: "Some",
            value: { status: "revoked" },
          });
          expect(yield* bound.assignments.listActiveByMember(viewer.id)).toEqual([changed]);
          const batches = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
          expect(batches.at(-1)?.entries).toHaveLength(2);
          expect(
            yield* Effect.flip(
              Operations.assign(workspace.id, bob, {
                memberId: viewer.id,
                roleId: BuiltinRoles.AdministratorId,
              }),
            ),
          ).toMatchObject({ _tag: "Authorization.Denied" });
        }),
      ),
    ),
);

it.effect(
  "delegation protects owners and administrators across assignment and member-removal endpoints",
  () =>
    temporary((filename) =>
      runHost(
        filename,
        Effect.gen(function* () {
          const { workspace, viewer, admin, bound } = yield* setup;
          const peerId = Identity.HumanId.make("peer");
          const peerInvite = yield* Operations.invite(
            workspace.id,
            alice,
            request(workspace.id, yield* future, peerId, BuiltinRoles.AdministratorId),
          );
          const peer = yield* Operations.acceptInvitation(
            workspace.id,
            peerId,
            peerInvite.details.id,
          );
          const ownerAccess = yield* Operations.access(
            workspace.id,
            alice,
            workspace.ownerMemberId,
          );
          const adminAccess = yield* Operations.access(workspace.id, alice, peer.id);
          const viewerAccess = yield* Operations.access(workspace.id, charlie, viewer.id);
          expect(viewerAccess.canManage).toBe(true);
          expect((yield* Operations.access(workspace.id, charlie, admin.id)).canManage).toBe(false);
          expect(ownerAccess.canManage).toBe(false);
          const ownerAssignment = ownerAccess.assignments[0];
          const adminAssignment = adminAccess.assignments[0];
          if (!ownerAssignment || !adminAssignment) throw new Error("Missing initial assignment");
          const attempts: ReadonlyArray<Effect.Effect<unknown, unknown, Gateway.Service>> = [
            Operations.assign(workspace.id, charlie, {
              memberId: viewer.id,
              roleId: BuiltinRoles.AdministratorId,
            }),
            Operations.assign(workspace.id, alice, {
              memberId: viewer.id,
              roleId: BuiltinRoles.OwnerId,
            }),
            Operations.assign(workspace.id, charlie, {
              memberId: peer.id,
              roleId: BuiltinRoles.ViewerId,
            }),
            Operations.revokeAssignment(workspace.id, charlie, peer.id, adminAssignment.id),
            Operations.revokeAssignment(
              workspace.id,
              alice,
              workspace.ownerMemberId,
              ownerAssignment.id,
            ),
            Operations.change(workspace.id, alice, {
              memberId: workspace.ownerMemberId,
              roleId: BuiltinRoles.ViewerId,
              expectedAssignmentIds: [ownerAssignment.id],
            }),
            Operations.removeMember(workspace.id, charlie, peer.id),
            Operations.removeMember(workspace.id, charlie, workspace.ownerMemberId),
            Operations.assign(workspace.id, alice, {
              memberId: viewer.id,
              roleId: Role.Id.make("invented"),
            }),
          ];
          const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 30 });
          for (const attempt of attempts) {
            yield* Effect.flip(attempt);
            expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 30 })).toEqual(before);
          }
          yield* Operations.removeMember(workspace.id, charlie, viewer.id);
          expect(
            yield* Effect.flip(
              Operations.assign(workspace.id, alice, {
                memberId: viewer.id,
                roleId: BuiltinRoles.ViewerId,
              }),
            ),
          ).toMatchObject({ _tag: "AssignmentApplication.InactiveMember" });
        }),
      ),
    ),
);

it.effect("competing role changes reject stale assignments rather than overwrite the winner", () =>
  temporary((filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, viewer, bound } = yield* setup;
        const access = yield* Operations.access(workspace.id, alice, viewer.id);
        const input = {
          memberId: viewer.id,
          roleId: BuiltinRoles.AdministratorId,
          expectedAssignmentIds: access.assignments.map(({ id }) => id),
        };
        const results = yield* Effect.forEach(
          [1, 2],
          () => Operations.change(workspace.id, alice, input).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter(({ _tag }) => _tag === "Success")).toHaveLength(1);
        expect(results.find(({ _tag }) => _tag === "Failure")).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "AssignmentApplication.Changed" },
        });
        expect(yield* bound.assignments.listActiveByMember(viewer.id)).toHaveLength(1);
      }),
    ),
  ),
);

it.effect("a failed role-change checkpoint restores the previous assignments and journal", () =>
  temporary((filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, viewer, bound } = yield* setup;
        const active = yield* bound.assignments.listActiveByMember(viewer.id);
        const before = yield* bound.store.read(Log.Id.make("journal"), { limit: 20 });
        const failure = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected assignment checkpoint failure",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              cursor.index === 1 ? Effect.fail(failure) : bound.checkpoints.set(key, cursor),
          }),
        };
        const rejected = yield* Effect.flatMap(AssignmentApplication.Service, (service) =>
          service.change({
            memberId: viewer.id,
            roleId: BuiltinRoles.AdministratorId,
            expectedAssignmentIds: active.map(({ id }) => id),
          }),
        ).pipe(
          Effect.provide(core(broken)),
          Effect.provideService(Actor.Service, {
            workspaceId: workspace.id,
            memberId: workspace.ownerMemberId,
            identity: alice,
          }),
          Effect.flip,
        );
        expect(rejected).toBe(failure);
        expect(yield* bound.assignments.listActiveByMember(viewer.id)).toEqual(active);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 20 })).toEqual(before);
      }),
    ),
  ),
);

it.effect("pending invitations recheck the administrator's authority after demotion", () =>
  temporary((filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, admin, bound } = yield* setup;
        const recipientId = alice.id + ".new";
        const recipient = Identity.HumanId.make(recipientId);
        const invitation = yield* Operations.invite(
          workspace.id,
          charlie,
          request(workspace.id, yield* future, recipient),
        );
        const assignments = yield* bound.assignments.listActiveByMember(admin.id);
        yield* Operations.change(workspace.id, alice, {
          memberId: admin.id,
          roleId: BuiltinRoles.ViewerId,
          expectedAssignmentIds: assignments.map(({ id }) => id),
        });
        expect(
          yield* Effect.flip(
            Operations.acceptInvitation(workspace.id, recipient, invitation.details.id),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        expect(yield* bound.members.findActive({ _tag: "Human", id: recipient })).toEqual(
          Option.none(),
        );
        expect(yield* bound.invitations.get(invitation.details.id)).toMatchObject({
          _tag: "Some",
          value: { state: { _tag: "Pending" } },
        });
      }),
    ),
  ),
);
