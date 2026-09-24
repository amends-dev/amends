import { AgentPermissions } from "@amends/core/agent";
import { AssignmentPermissions, BuiltinRoles } from "@amends/core/authorization";
import { GroupMembershipPermissions, GroupPermissions } from "@amends/core/group";
import type { Identity } from "@amends/core/identity";
import { Journal, Publication } from "@amends/core/journal";
import {
  ThreadMessagePermissions,
  ThreadParticipationPermissions,
  ThreadPermissions,
} from "@amends/core/thread";
import {
  InvitationApplication,
  InvitationPermissions,
  MemberApplication,
  MemberFacts,
  MemberPermissions,
  Invitation,
  OwnershipPermissions,
  Workspace,
} from "@amends/core/workspace";
import { Gateway, GatewayErrors, WorkspaceDirectory } from "@amends/gateway";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import type { Harness } from "./harness.ts";
import { Operations } from "./operations.ts";
import {
  alice,
  bob,
  boundTo,
  forWorkspace,
  future,
  journalLog,
  Support,
  testProvenance,
} from "./support.ts";

/** Workspace creation, isolation, boot, and the directory through the gateway. */
export const gateway = (harness: Harness) => {
  const { core, runGateway } = Support.make(harness);
  describe.skipIf(!harness.available)(`${harness.name}: gateway`, () => {
    it.effect(
      "one host creates two isolated workspaces and uses each operation's authenticated identity",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            expectTypeOf<
              Effect.Services<ReturnType<typeof Operations.getMember>>
            >().toEqualTypeOf<Gateway.Service>();
            expectTypeOf<
              Effect.Services<ReturnType<Gateway.Interface["createWorkspace"]>>
            >().toEqualTypeOf<never>();
            const workspaces = yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const a = yield* Operations.createWorkspace(alice.id);
                  const b = yield* Operations.createWorkspace(bob.id);
                  const requests = Array.from({ length: 20 }, (_, index) => {
                    const [workspace, identity] =
                      index % 2 === 0 ? ([a, alice] as const) : ([b, bob] as const);
                    return Operations.getMember(
                      workspace.id,
                      identity,
                      workspace.ownerMemberId,
                    ).pipe(
                      Effect.tap((record) => {
                        expect(record.workspaceId).toBe(workspace.id);
                        expect(record.identity).toEqual(identity);
                        return Effect.void;
                      }),
                    );
                  });
                  yield* Effect.all(requests, { concurrency: "unbounded" });
                  expect(
                    yield* Effect.flip(Operations.getMember(b.id, alice, b.ownerMemberId)),
                  ).toMatchObject({ _tag: "Gateway.NotMember" });
                  expect(
                    yield* Effect.flip(Operations.getMember(a.id, bob, a.ownerMemberId)),
                  ).toMatchObject({ _tag: "Gateway.NotMember" });
                  expect(
                    yield* Effect.flip(Operations.getMember(a.id, alice, b.ownerMemberId)),
                  ).toMatchObject({ _tag: "MemberApplication.NotFound" });
                  return [a, b];
                }),
              ),
            );
            const host = yield* storage.connect();
            for (const workspace of workspaces) {
              const bound = yield* forWorkspace(host, workspace.id);
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
              const assignments = yield* bound.assignments.listActiveByMember(
                workspace.ownerMemberId,
              );
              expect(assignments.map((assignment) => assignment.source)).toEqual([
                {
                  _tag: "Role",
                  roleId: BuiltinRoles.OwnerId,
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              ]);
              expect(yield* bound.roles.get(BuiltinRoles.ViewerId)).toEqual(
                Option.some({
                  id: BuiltinRoles.ViewerId,
                  workspaceId: workspace.id,
                  name: "Viewer",
                  permissions: [
                    MemberPermissions.Read.name,
                    AssignmentPermissions.Read.name,
                    GroupPermissions.Read.name,
                    GroupPermissions.Follow.name,
                    ThreadPermissions.Start.name,
                    ThreadPermissions.Read.name,
                    ThreadMessagePermissions.Publish.name,
                    ThreadParticipationPermissions.Follow.name,
                    AgentPermissions.Use.name,
                  ],
                }),
              );
              for (const [id, name] of [
                [BuiltinRoles.AdministratorId, "Administrator"],
                [BuiltinRoles.OwnerId, "Owner"],
              ] as const) {
                expect(yield* bound.roles.get(id)).toEqual(
                  Option.some({
                    id,
                    workspaceId: workspace.id,
                    name,
                    permissions: [
                      MemberPermissions.Read.name,
                      MemberPermissions.Remove.name,
                      InvitationPermissions.Manage.name,
                      AssignmentPermissions.Read.name,
                      AssignmentPermissions.Manage.name,
                      ...(id === BuiltinRoles.OwnerId ? [OwnershipPermissions.Transfer.name] : []),
                      GroupPermissions.Create.name,
                      GroupPermissions.Read.name,
                      GroupPermissions.Follow.name,
                      GroupMembershipPermissions.Manage.name,
                      ThreadPermissions.Start.name,
                      ThreadPermissions.Read.name,
                      ThreadMessagePermissions.Publish.name,
                      ThreadParticipationPermissions.Follow.name,
                      AgentPermissions.Use.name,
                    ],
                  }),
                );
              }
              expect(yield* bound.roles.builtinRevision).toEqual(
                Option.some(BuiltinRoles.revision),
              );
              const batches = yield* bound.store.read(journalLog, { limit: 10 });
              expect(batches).toHaveLength(1);
              expect(batches[0]?.entries).toHaveLength(7);
              expect(batches[0]?.commit.entryCount).toBe(7);
            }
          }),
        ),
    );

    it.effect("the gateway runs the membership workflow over two isolated workspaces", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const outcome = yield* Effect.scoped(
            runGateway(
              storage,
              Effect.gen(function* () {
                const entry = yield* Gateway.Service;
                const a = yield* entry.createWorkspace(alice.id, { name: "Alice workspace" });
                const b = yield* entry.createWorkspace(bob.id, { name: "Bob workspace" });
                const getMember = (
                  workspace: Workspace.Record,
                  identity: Identity.MemberReference,
                ) =>
                  entry.asMember(
                    workspace.id,
                    identity,
                    Effect.flatMap(MemberApplication.Service, (members) =>
                      members.get(workspace.ownerMemberId),
                    ),
                  );
                yield* Effect.all(
                  Array.from({ length: 20 }, (_, index) =>
                    index % 2 === 0 ? getMember(a, alice) : getMember(b, bob),
                  ),
                  { concurrency: "unbounded" },
                );
                const crossed = yield* Effect.flip(getMember(b, alice));
                const expiresAt = yield* future;
                const invitation = yield* entry.asMember(
                  a.id,
                  alice,
                  Effect.flatMap(InvitationApplication.Service, (invitations) =>
                    invitations.issue({
                      recipientId: bob.id,
                      expiresAt,
                      roleId: BuiltinRoles.ViewerId,
                    }),
                  ),
                );
                const listing = yield* (yield* WorkspaceDirectory.Service).list(bob);
                const joined = yield* entry.inWorkspace(
                  a.id,
                  Effect.flatMap(InvitationApplication.Service, (invitations) =>
                    invitations.accept(invitation.details.id, bob.id),
                  ),
                );
                const afterJoin = yield* (yield* WorkspaceDirectory.Service).list(bob);
                const stored = yield* entry.asMember(
                  a.id,
                  alice,
                  Effect.flatMap(InvitationApplication.Service, (invitations) => invitations.list),
                );
                const removed = yield* entry.asMember(
                  a.id,
                  alice,
                  Effect.flatMap(MemberApplication.Service, (members) => members.remove(joined.id)),
                );
                const members = yield* entry.asMember(
                  a.id,
                  alice,
                  Effect.flatMap(MemberApplication.Service, (members) => members.list),
                );
                return {
                  a,
                  b,
                  crossed,
                  invitation,
                  listing,
                  joined,
                  afterJoin,
                  stored,
                  removed,
                  members,
                };
              }),
            ),
          );
          expect(outcome.crossed).toMatchObject({ _tag: "Gateway.NotMember" });
          expect(outcome.listing.memberships.map((m) => m.workspace.id)).toEqual([outcome.b.id]);
          expect(outcome.listing.invitations).toEqual([outcome.invitation]);
          expect(outcome.joined).toMatchObject({ identity: bob, status: "active" });
          expect(outcome.afterJoin.invitations).toEqual([]);
          const activeMemberCounts = new Map(
            outcome.afterJoin.memberships.map((m) => [m.workspace.id, m.activeMemberCount]),
          );
          expect(activeMemberCounts).toEqual(
            new Map([
              [outcome.a.id, 2],
              [outcome.b.id, 1],
            ]),
          );
          // Grants come back in their issued order, with their exact scopes and instants.
          expect(outcome.stored).toEqual([
            {
              details: outcome.invitation.details,
              state: {
                _tag: "Accepted",
                memberId: outcome.joined.id,
                acceptedAt: expect.anything(),
              },
            },
          ]);
          expect(outcome.removed).toMatchObject({ id: outcome.joined.id, status: "removed" });
          expect(outcome.members.map((m) => m.status).sort()).toEqual(["active", "removed"]);
          const bound = yield* forWorkspace(yield* storage.connect(), outcome.a.id);
          const batches = yield* bound.store.read(journalLog, { limit: 10 });
          expect(batches.map((batch) => Number(batch.position))).toEqual([0, 1, 2, 3]);
          expect(batches[0]?.entries).toHaveLength(7);
          expect(batches[0]?.commit.entryCount).toBe(7);
          const second = batches[1];
          if (second === undefined) return yield* Effect.die("Missing second batch");
          expect(yield* bound.store.get(journalLog, second.commit.id)).toEqual(Option.some(second));
          const accepted = yield* bound.assignments.listActiveByMember(outcome.joined.id);
          expect(accepted.map((assignment) => assignment.source)).toEqual([
            {
              _tag: "Role",
              roleId: BuiltinRoles.ViewerId,
              scope: { _tag: "Workspace", workspaceId: outcome.a.id },
            },
          ]);
        }),
      ),
    );

    it.effect("workspace creation rejects blank names before persisting a workspace", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const gateway = yield* Gateway.Service;
            for (const name of ["", " \t\n"]) {
              expect(yield* Effect.flip(gateway.createWorkspace(alice.id, { name }))).toMatchObject(
                { _tag: "Gateway.InvalidInput" },
              );
            }
            expect(yield* (yield* WorkspaceDirectory.Service).list(alice)).toEqual({
              memberships: [],
              invitations: [],
            });
            const workspace = yield* gateway.createWorkspace(alice.id, { name: "Studio" });
            expect(workspace.name).toBe("Studio");
            const listing = yield* (yield* WorkspaceDirectory.Service).list(alice);
            expect(listing.memberships.map((membership) => membership.workspace)).toEqual([
              workspace,
            ]);
          }),
        ),
      ),
    );

    it.effect(
      "requests for workspaces that were never created, or by non-members, leave nothing stored",
      () =>
        harness.withStorage((storage) =>
          Effect.gen(function* () {
            const workspace = yield* Effect.scoped(
              runGateway(storage, Operations.createWorkspace(alice.id)),
            );
            const before = yield* storage.footprint;
            yield* Effect.scoped(
              runGateway(
                storage,
                Effect.gen(function* () {
                  const unknown = Workspace.Id.make("never-created");
                  expect(
                    yield* Effect.flip(Operations.getMember(unknown, bob, workspace.ownerMemberId)),
                  ).toEqual(new GatewayErrors.NotMember({ workspaceId: unknown }));
                  expect(
                    yield* Effect.flip(
                      Operations.acceptInvitation(
                        unknown,
                        bob.id,
                        Invitation.Id.make("never-issued"),
                      ),
                    ),
                  ).toEqual(new GatewayErrors.WorkspaceNotFound({ workspaceId: unknown }));
                  expect(
                    yield* Effect.flip(
                      Operations.getMember(workspace.id, bob, workspace.ownerMemberId),
                    ),
                  ).toEqual(new GatewayErrors.NotMember({ workspaceId: workspace.id }));
                }),
              ),
            );
            expect(yield* storage.footprint).toBe(before);
          }),
        ),
    );

    it.effect("cold workspace boot replays projection history before resolving the caller", () =>
      harness.withStorage((storage) =>
        Effect.gen(function* () {
          const workspace = yield* Effect.scoped(
            runGateway(storage, Operations.createWorkspace(alice.id)),
          );
          // Discard the read models while no host is running.
          yield* storage.discardProjections;
          const before = yield* Effect.scoped(
            Effect.gen(function* () {
              const bound = yield* forWorkspace(yield* storage.connect(), workspace.id);
              expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
              return yield* bound.store.read(journalLog, { limit: 20 });
            }),
          );
          yield* runGateway(
            storage,
            Effect.gen(function* () {
              const member = yield* Operations.getMember(
                workspace.id,
                alice,
                workspace.ownerMemberId,
              );
              expect(member).toMatchObject({
                id: workspace.ownerMemberId,
                identity: alice,
                status: "active",
              });
              const bound = yield* boundTo(workspace.id);
              expect(yield* bound.members.findActive(alice)).toEqual(Option.some(member));
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
              expect(yield* bound.store.read(journalLog, { limit: 20 })).toEqual(before);
            }),
          );
        }),
      ),
    );

    it.effect("the directory keeps a workspace whose members were all removed", () =>
      harness.withStorage((storage) =>
        runGateway(
          storage,
          Effect.gen(function* () {
            const workspace = yield* (yield* Gateway.Service).createWorkspace(alice.id, {
              name: "Archive",
            });
            // Applications keep an owner; a direct fact reaches the empty state the directory must list.
            const bound = yield* boundTo(workspace.id);
            yield* Effect.flatMap(Journal.Service, (journal) =>
              journal.commit(
                journal.publish(MemberFacts.Removed, {
                  workspaceId: workspace.id,
                  memberId: workspace.ownerMemberId,
                }),
              ),
            ).pipe(
              Effect.provideService(Publication.Service, testProvenance(workspace.id)),
              Effect.provide(core(bound)),
            );
            expect(yield* (yield* WorkspaceDirectory.Service).list(alice)).toEqual({
              memberships: [
                {
                  workspace,
                  member: {
                    id: workspace.ownerMemberId,
                    workspaceId: workspace.id,
                    identity: alice,
                    status: "removed",
                  },
                  activeMemberCount: 0,
                },
              ],
              invitations: [],
            });
          }),
        ),
      ),
    );
  });
};
