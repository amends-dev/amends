import { testProvenance } from "./support.ts";
import { expect, test } from "bun:test";
import {
  Assignment,
  AssignmentFacts,
  AssignmentStore,
  BuiltinRoles,
  Grant,
  RoleFacts,
} from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import {
  Member,
  MemberFacts,
  MemberPermissions,
  OwnershipApplication,
  OwnershipPermissions,
  WorkspaceProjection,
} from "@amends/core/workspace";
import { Context, Effect, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  charlie,
  core,
  runHost,
  temporary,
  boundTo,
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
  const recipient = yield* Operations.acceptInvitation(workspace.id, bob.id, invitation.details.id);
  const second = yield* Operations.invite(
    workspace.id,
    alice,
    request(workspace.id, yield* future, charlie.id),
  );
  const other = yield* Operations.acceptInvitation(workspace.id, charlie.id, second.details.id);
  const view = yield* Operations.ownership(workspace.id, alice);
  return { workspace, recipient, other, view, bound: yield* boundTo(workspace.id) };
});
const journalLog = Log.Id.make("journal");

test("transfer replaces workspace roles, preserves separate access and attribution, and changes delegation immediately", async () =>
  temporary(async (filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, view, bound } = yield* setup;
        expect(view.canTransfer).toBe(true);
        expect(view.candidates.map(({ id }) => id)).toContain(recipient.id);
        const readerView = yield* Operations.ownership(workspace.id, bob);
        expect(readerView.canTransfer).toBe(false);
        expect(readerView.candidates).toEqual([]);
        yield* Operations.assign(workspace.id, alice, {
          memberId: recipient.id,
          roleId: BuiltinRoles.AdministratorId,
        });
        const preservedId = Assignment.Id.make("separate-access");
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(
            AssignmentFacts.Created,
            {
              workspaceId: workspace.id,
              assignmentId: preservedId,
              memberId: recipient.id,
              source: {
                _tag: "Direct",
                grant: Grant.make(MemberPermissions.Read, {
                  _tag: "Target",
                  target: {
                    _tag: "Member",
                    workspaceId: workspace.id,
                    memberId: workspace.ownerMemberId,
                  },
                }),
              },
            },
            testProvenance(workspace.id),
          ),
        ).pipe(Effect.provide(core(bound)));
        const preserved = yield* bound.assignments.get(preservedId);
        const changed = yield* Operations.transferOwnership(workspace.id, alice, {
          memberId: recipient.id,
          expectedOwnerAssignmentId: view.ownerAssignmentId,
        });
        expect(changed).toEqual({
          id: workspace.id,
          name: workspace.name,
          createdBy: alice.id,
          ownerMemberId: recipient.id,
        });
        expect(yield* bound.assignments.get(preservedId)).toEqual(preserved);
        expect(
          (yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).map(
            ({ source }) => source,
          ),
        ).toEqual([
          {
            _tag: "Role",
            roleId: BuiltinRoles.AdministratorId,
            scope: { _tag: "Workspace", workspaceId: workspace.id },
          },
        ]);
        const owners = yield* bound.assignments.listActiveByRole(BuiltinRoles.OwnerId);
        expect(owners).toHaveLength(1);
        expect(owners[0]?.memberId).toBe(recipient.id);
        expect(owners[0]?.id).not.toBe(view.ownerAssignmentId);
        expect(yield* bound.assignments.get(view.ownerAssignmentId)).toMatchObject({
          _tag: "Some",
          value: { status: "revoked" },
        });
        expect((yield* Operations.ownership(workspace.id, alice)).canTransfer).toBe(false);
        expect((yield* Operations.ownership(workspace.id, bob)).canTransfer).toBe(true);
        expect(
          yield* Effect.flip(Operations.removeMember(workspace.id, alice, recipient.id)),
        ).toMatchObject({ _tag: "MemberApplication.OwnerProtected" });
        expect(
          yield* Effect.flip(
            Operations.assign(workspace.id, alice, {
              memberId: workspace.ownerMemberId,
              roleId: BuiltinRoles.ViewerId,
            }),
          ),
        ).toMatchObject({ _tag: "Delegation.Denied" });
        expect((yield* bound.store.read(journalLog, { limit: 30 })).at(-1)?.entries).toHaveLength(
          6,
        );
      }),
    ),
  ));

test("only a permitted current owner can transfer to another active human in the same workspace", async () =>
  temporary(async (filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, other, view, bound } = yield* setup;
        const agentId = Member.Id.make("agent");
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(
            MemberFacts.Added,
            {
              workspaceId: workspace.id,
              memberId: agentId,
              identity: { _tag: "Agent", id: Identity.AgentId.make("agent") },
            },
            testProvenance(workspace.id),
          ),
        ).pipe(Effect.provide(core(bound)));
        yield* Operations.removeMember(workspace.id, alice, other.id);
        const elsewhere = yield* Operations.createWorkspace(alice.id);
        const before = yield* bound.store.read(journalLog, { limit: 30 });
        for (const [memberId, tag] of [
          [workspace.ownerMemberId, "OwnershipApplication.InvalidRecipient"],
          [other.id, "OwnershipApplication.InvalidRecipient"],
          [agentId, "OwnershipApplication.InvalidRecipient"],
          [elsewhere.ownerMemberId, "OwnershipApplication.MemberNotFound"],
        ] as const) {
          expect(
            yield* Effect.flip(
              Operations.transferOwnership(workspace.id, alice, {
                memberId,
                expectedOwnerAssignmentId: view.ownerAssignmentId,
              }),
            ),
          ).toMatchObject({ _tag: tag });
          expect(yield* bound.store.read(journalLog, { limit: 30 })).toEqual(before);
        }
        expect(
          (yield* Operations.ownership(workspace.id, alice)).candidates.map(({ id }) => id),
        ).toEqual([recipient.id]);
        expect(
          yield* Effect.flip(
            Operations.transferOwnership(workspace.id, bob, {
              memberId: recipient.id,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
        // Having the action permission alone does not confer ownership.
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(
            AssignmentFacts.Created,
            {
              workspaceId: workspace.id,
              assignmentId: Assignment.Id.make("transfer-permission"),
              memberId: recipient.id,
              source: {
                _tag: "Direct",
                grant: Grant.make(OwnershipPermissions.Transfer, {
                  _tag: "Workspace",
                  workspaceId: workspace.id,
                }),
              },
            },
            testProvenance(workspace.id),
          ),
        ).pipe(Effect.provide(core(bound)));
        expect(
          yield* Effect.flip(
            Operations.transferOwnership(workspace.id, bob, {
              memberId: workspace.ownerMemberId,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }),
          ),
        ).toMatchObject({ _tag: "OwnershipApplication.NotOwner" });
        yield* Effect.flatMap(Journal.Service, (journal) =>
          journal.publish(
            RoleFacts.PermissionsChanged,
            {
              workspaceId: workspace.id,
              roleId: BuiltinRoles.OwnerId,
              permissions: [MemberPermissions.Read.name],
            },
            testProvenance(workspace.id),
          ),
        ).pipe(Effect.provide(core(bound)));
        expect((yield* Operations.ownership(workspace.id, alice)).canTransfer).toBe(false);
        expect(
          yield* Effect.flip(
            Operations.transferOwnership(workspace.id, alice, {
              memberId: recipient.id,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }),
          ),
        ).toMatchObject({ _tag: "Authorization.Denied" });
      }),
    ),
  ));

test("competing transfers leave one owner and stale requests stay stale after ownership returns", async () =>
  temporary(async (filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, other, view, bound } = yield* setup;
        const results = yield* Effect.forEach(
          [recipient.id, other.id],
          (memberId) =>
            Operations.transferOwnership(workspace.id, alice, {
              memberId,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter(({ _tag }) => _tag === "Success")).toHaveLength(1);
        expect(results.filter(({ _tag }) => _tag === "Failure")).toHaveLength(1);
        const owners = yield* bound.assignments.listActiveByRole(BuiltinRoles.OwnerId);
        expect(owners).toHaveLength(1);
        const owner = owners[0];
        if (!owner) throw new Error("Missing owner");
        const identity = owner.memberId === recipient.id ? bob : charlie;
        yield* Operations.transferOwnership(workspace.id, identity, {
          memberId: workspace.ownerMemberId,
          expectedOwnerAssignmentId: owner.id,
        });
        const before = yield* bound.store.read(journalLog, { limit: 30 });
        expect(
          yield* Effect.flip(
            Operations.transferOwnership(workspace.id, alice, {
              memberId: recipient.id,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }),
          ),
        ).toMatchObject({ _tag: "OwnershipApplication.Changed" });
        expect(yield* bound.store.read(journalLog, { limit: 30 })).toEqual(before);
        expect((yield* bound.assignments.listActiveByRole(BuiltinRoles.OwnerId))[0]?.memberId).toBe(
          workspace.ownerMemberId,
        );
      }),
    ),
  ));

test("a failed final ownership checkpoint rolls back metadata, roles, assignments, and journal", async () =>
  temporary(async (filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, view, bound } = yield* setup;
        const before = yield* bound.store.read(journalLog, { limit: 20 });
        const previous = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
        const next = yield* bound.assignments.listActiveByMember(recipient.id);
        const failure = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected ownership checkpoint failure",
        });
        const broken = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              key.name === WorkspaceProjection.definition.name && cursor.index === 4
                ? Effect.fail(failure)
                : bound.checkpoints.set(key, cursor),
          }),
        };
        expect(
          yield* Effect.flatMap(OwnershipApplication.Service, (service) =>
            service.transfer({
              memberId: recipient.id,
              expectedOwnerAssignmentId: view.ownerAssignmentId,
            }),
          ).pipe(
            Effect.provide(core(broken)),
            Effect.provideService(Actor.Service, {
              workspaceId: workspace.id,
              memberId: workspace.ownerMemberId,
              identity: alice,
            }),
            Effect.flip,
          ),
        ).toBe(failure);
        expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
        expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual(
          previous,
        );
        expect(yield* bound.assignments.listActiveByMember(recipient.id)).toEqual(next);
        expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
      }),
    ),
  ));

test("missing or competing Owner assignments fail closed without attempting a transfer", async () =>
  temporary(async (filename) =>
    runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, view, bound } = yield* setup;
        const owner = (yield* bound.assignments.listActiveByRole(BuiltinRoles.OwnerId))[0];
        if (!owner) throw new Error("Missing owner");
        const before = yield* bound.store.read(journalLog, { limit: 20 });
        for (const records of [[], [owner, owner]]) {
          const broken = {
            ...bound,
            context: Context.add(bound.context, AssignmentStore.Service, {
              ...bound.assignments,
              listActiveByRole: () => Effect.succeed(records),
            }),
          };
          expect(
            yield* Effect.flatMap(OwnershipApplication.Service, (service) =>
              service.transfer({
                memberId: recipient.id,
                expectedOwnerAssignmentId: view.ownerAssignmentId,
              }),
            ).pipe(
              Effect.provide(core(broken)),
              Effect.provideService(Actor.Service, {
                workspaceId: workspace.id,
                memberId: workspace.ownerMemberId,
                identity: alice,
              }),
              Effect.flip,
            ),
          ).toMatchObject({ _tag: "OwnershipApplication.InvalidState" });
          expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
        }
      }),
    ),
  ));

test("ownership transfer survives restart and journal replay without reauthorizing the former owner", async () =>
  temporary(async (filename) => {
    const saved = await runHost(
      filename,
      Effect.gen(function* () {
        const { workspace, recipient, view } = yield* setup;
        const changed = yield* Operations.transferOwnership(workspace.id, alice, {
          memberId: recipient.id,
          expectedOwnerAssignmentId: view.ownerAssignmentId,
        });
        return { workspace: changed, recipient };
      }),
    );
    await runHost(
      filename,
      Effect.gen(function* () {
        const view = yield* Operations.ownership(saved.workspace.id, bob);
        expect(view.workspace).toEqual(saved.workspace);
        const sql = yield* SqlClient.SqlClient;
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM members`;
            yield* sql`DELETE FROM assignments`;
            yield* sql`DELETE FROM roles`;
            yield* sql`DELETE FROM invitations`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        const replayed = yield* Operations.ownership(saved.workspace.id, bob);
        expect(replayed).toEqual(view);
        expect((yield* Operations.ownership(saved.workspace.id, alice)).canTransfer).toBe(false);
      }),
    );
  }));
