import {
  Assignment,
  AssignmentFacts,
  BuiltinRoles,
  Grant,
  RoleFacts,
} from "@amends/core/authorization";

import { Actor, Identity } from "@amends/core/identity";

import { Journal, Store, Publication } from "@amends/core/journal";

import {
  Member,
  MemberFacts,
  MemberPermissions,
  OwnershipService,
  OwnershipPermissions,
} from "@amends/core/workspace";

import { describe, expect, it } from "@effect/vitest";

import { Effect, Option, Result } from "effect";

import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";

import {
  alice,
  bob,
  boundTo,
  charlie,
  failingLate,
  future,
  journalLog,
  request,
  Support,
  testProvenance,
} from "./support.ts";

/** Ownership transfer: authority, recipients, competition, rollback, and replay. */

export const ownership = (harness: Harness) => {
  const { core, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: ownership`, () => {
    const setup = Effect.gen(function* () {
      const workspace = yield* Operations.createWorkspace(alice.id);
      const invitation = yield* Operations.invite(workspace.id, alice, request(yield* future));
      const recipient = yield* Operations.acceptInvitation(
        workspace.id,
        bob.id,
        invitation.details.id,
      );
      const second = yield* Operations.invite(
        workspace.id,
        alice,
        request(yield* future, charlie.id),
      );
      const other = yield* Operations.acceptInvitation(workspace.id, charlie.id, second.details.id);
      const view = yield* Operations.ownership(workspace.id, alice);
      return { workspace, recipient, other, view, bound: yield* boundTo(workspace.id) };
    });
    it.effect(
      "transfer replaces workspace roles, preserves separate access and attribution, and changes delegation immediately",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
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
                journal
                  .publish(AssignmentFacts.Created, {
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
                  })
                  .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
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
              ).toMatchObject({ _tag: "MemberService.OwnerProtected" });
              expect(
                yield* Effect.flip(
                  Operations.assign(workspace.id, alice, {
                    memberId: workspace.ownerMemberId,
                    roleId: BuiltinRoles.MemberId,
                  }),
                ),
              ).toMatchObject({ _tag: "Delegation.Denied" });
              expect(
                (yield* bound.store.read(journalLog, { limit: 30 })).at(-1)?.entries,
              ).toHaveLength(6);
            }),
          ),
        ),
    );

    it.effect(
      "only a permitted current owner can transfer to another active human in the same workspace",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
            Effect.gen(function* () {
              const { workspace, recipient, other, view, bound } = yield* setup;
              const agentId = Member.Id.make("agent");
              yield* Effect.flatMap(Journal.Service, (journal) =>
                journal
                  .publish(MemberFacts.Added, {
                    workspaceId: workspace.id,
                    memberId: agentId,
                    identity: { _tag: "Agent", id: Identity.AgentId.make("agent") },
                  })
                  .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
              ).pipe(Effect.provide(core(bound)));
              yield* Operations.removeMember(workspace.id, alice, other.id);
              const elsewhere = yield* Operations.createWorkspace(alice.id);
              const before = yield* bound.store.read(journalLog, { limit: 30 });
              for (const [memberId, tag] of [
                [workspace.ownerMemberId, "OwnershipService.InvalidRecipient"],
                [other.id, "OwnershipService.InvalidRecipient"],
                [agentId, "OwnershipService.InvalidRecipient"],
                [elsewhere.ownerMemberId, "OwnershipService.MemberNotFound"],
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
                journal
                  .publish(AssignmentFacts.Created, {
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
                  })
                  .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
              ).pipe(Effect.provide(core(bound)));
              expect(
                yield* Effect.flip(
                  Operations.transferOwnership(workspace.id, bob, {
                    memberId: workspace.ownerMemberId,
                    expectedOwnerAssignmentId: view.ownerAssignmentId,
                  }),
                ),
              ).toMatchObject({ _tag: "OwnershipService.NotOwner" });
              yield* Effect.flatMap(Journal.Service, (journal) =>
                journal
                  .publish(RoleFacts.PermissionsChanged, {
                    workspaceId: workspace.id,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: [MemberPermissions.Read.name],
                  })
                  .pipe(Effect.provideService(Publication.Service, testProvenance(workspace.id))),
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
        ),
    );

    it.effect(
      "competing transfers leave one owner and stale requests stay stale after ownership returns",
      () =>
        harness.withStorage((storage) =>
          runGateway(
            storage,
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
              expect(results.filter(Result.isSuccess)).toHaveLength(1);
              expect(results.filter(Result.isFailure)).toHaveLength(1);
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
              ).toMatchObject({ _tag: "OwnershipService.Changed" });
              expect(yield* bound.store.read(journalLog, { limit: 30 })).toEqual(before);
              expect(
                (yield* bound.assignments.listActiveByRole(BuiltinRoles.OwnerId))[0]?.memberId,
              ).toBe(workspace.ownerMemberId);
            }),
          ),
        ),
    );

    it.effect("a late ownership failure rolls back metadata, roles, assignments, and journal", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const { workspace, recipient, view, bound } = yield* setup;
            const before = yield* bound.store.read(journalLog, { limit: 20 });
            const previous = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
            const next = yield* bound.assignments.listActiveByMember(recipient.id);
            const failure = new Store.Failure({
              operation: "commit",
              cause: "injected late failure",
            });
            const broken = failingLate(bound, failure);
            expect(
              yield* Effect.flatMap(OwnershipService.Service, (ownershipService) =>
                ownershipService.transfer({
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
      ),
    );

    it.effect(
      "ownership transfer survives restart and journal replay without reauthorizing the former owner",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const saved = yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const { workspace, recipient, view } = yield* setup;
                  const changed = yield* Operations.transferOwnership(workspace.id, alice, {
                    memberId: recipient.id,
                    expectedOwnerAssignmentId: view.ownerAssignmentId,
                  });
                  return { workspace: changed, recipient, formerOwner: workspace.ownerMemberId };
                }),
              ),
            );
            yield* runGateway(
              storage,
              Effect.gen(function* () {
                const view = yield* Operations.ownership(saved.workspace.id, bob);
                expect(view.workspace).toEqual(saved.workspace);
                yield* storage.discardProjections;
                const bound = yield* boundTo(saved.workspace.id);
                yield* Effect.flatMap(Journal.Service, (journal) => journal.replay).pipe(
                  Effect.provide(core(bound)),
                );
                const replayed = yield* Operations.ownership(saved.workspace.id, bob);
                expect(replayed).toEqual(view);
                expect((yield* Operations.ownership(saved.workspace.id, alice)).canTransfer).toBe(
                  false,
                );
                expect(
                  (yield* bound.assignments.listActiveByMember(saved.formerOwner)).map(
                    ({ source }) => source,
                  ),
                ).toEqual([
                  {
                    _tag: "Role",
                    roleId: BuiltinRoles.AdministratorId,
                    scope: { _tag: "Workspace", workspaceId: saved.workspace.id },
                  },
                ]);
              }),
            );
          }),
        ),
    );
  });
};
