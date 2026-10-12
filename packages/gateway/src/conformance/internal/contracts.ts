import { Assignment, Grant, Role, Scope, Target } from "@amends-dev/core/authorization";
import { Group, GroupFollow, GroupMembership, GroupService } from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Checkpoint, Entry, Store } from "@amends-dev/core/journal";
import {
  ThreadActivity,
  ThreadActivityKind,
  ThreadId,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadParticipation,
  ThreadService,
} from "@amends-dev/core/thread";
import { Turn } from "@amends-dev/core/turn";
import { Member, MemberPermissions, Workspace } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Option } from "effect";
import type { Fixture } from "../Fixture.ts";
import * as Support from "../Support.ts";
import {
  alice,
  bob,
  type Bound,
  boundTo,
  charlie,
  core,
  forWorkspace,
  otherWorkspaceId,
  placedIn,
  runHost,
  workspaceId,
} from "../Support.ts";

/** Direct store calls: rollback of a conflict, uniqueness, conditional writes, and the live register. */

export const contracts = (fixture: Fixture) => {
  const { initialized } = Support;
  describe.skipIf(!fixture.available)(`${fixture.name}: store contracts`, () => {
    const permission = MemberPermissions.Read.name;
    const roleId = Role.Id.make("contract-role");
    const localScope = (
      kind: "Workspace" | "TargetWorkspace" | "TargetMember" | "TargetThread" | "TargetGroup",
      id: Workspace.Id,
      memberId: Member.Id,
    ): Scope.Scope => {
      if (kind === "Workspace") return Scope.Scope.cases.Workspace.make({ workspaceId: id });
      return Scope.Scope.cases.Target.make({
        target:
          kind === "TargetGroup"
            ? Target.Reference.cases.Group.make({
                workspaceId: id,
                groupId: Group.Id.make("group"),
              })
            : kind === "TargetThread"
              ? Target.Reference.cases.Thread.make({
                  workspaceId: id,
                  threadId: ThreadId.Id.make("thread"),
                })
              : kind === "TargetMember"
                ? Target.Reference.cases.Member.make({ workspaceId: id, memberId })
                : Target.Reference.cases.Workspace.make({ workspaceId: id }),
      });
    };
    const source = (kind: "Role" | "Direct", scope: Scope.Scope): Assignment.Source =>
      kind === "Role"
        ? Assignment.Source.cases.Role.make({ roleId, scope })
        : Assignment.Source.cases.Direct.make({ grant: Grant.Grant.make({ permission, scope }) });
    const seed = (bound: Bound) =>
      Effect.gen(function* () {
        const workspace = yield* initialized(bound);
        const role = Role.Role.make({
          id: roleId,
          workspaceId,
          name: "Readers",
          permissions: [permission],
        });
        yield* bound.store.transaction(bound.roles.insert(role));
        return { workspace, role };
      });
    it.effect("a conflict that escapes the program rolls back its earlier store writes", () =>
      fixture.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const { workspace, role } = yield* seed(bound);
            const record: Assignment.Assignment = {
              id: Assignment.Id.make("rolled-back"),
              workspaceId,
              memberId: workspace.ownerMemberId,
              status: "active",
              source: source(
                "Direct",
                localScope("Workspace", otherWorkspaceId, workspace.ownerMemberId),
              ),
            };
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  Effect.gen(function* () {
                    yield* bound.roles.rename(roleId, "Must roll back");
                    yield* bound.assignments.insert(record);
                  }),
                ),
              ),
            ).toMatchObject({ _tag: "AssignmentStore.Conflict" });
            expect(yield* bound.roles.get(roleId)).toEqual(Option.some(role));
            expect(yield* bound.assignments.get(record.id)).toEqual(Option.none());
          }),
        ),
      ),
    );

    it.effect("ownership storage changes only the owner when the previous owner matches", () =>
      fixture.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const workspace = yield* initialized(bound);
            const next = Member.Id.make("next-owner");
            const change = {
              workspaceId,
              previousOwnerMemberId: workspace.ownerMemberId,
              ownerMemberId: next,
            };
            yield* bound.store.transaction(
              Effect.gen(function* () {
                for (const input of [
                  { ...change, workspaceId: otherWorkspaceId },
                  { ...change, previousOwnerMemberId: next },
                  { ...change, ownerMemberId: workspace.ownerMemberId },
                ]) {
                  expect(
                    yield* Effect.flip(bound.workspace.transferOwnership(input)),
                  ).toMatchObject({
                    _tag: "WorkspaceStore.Conflict",
                  });
                  expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
                }
                const invalid = { ...change };
                Reflect.set(invalid, "ownerMemberId", "");
                expect(
                  yield* Effect.flip(bound.workspace.transferOwnership(invalid)),
                ).toMatchObject({
                  _tag: "WorkspaceStore.Conflict",
                });
                yield* bound.workspace.transferOwnership(change);
                expect(yield* Effect.flip(bound.workspace.transferOwnership(change))).toMatchObject(
                  {
                    _tag: "WorkspaceStore.Conflict",
                  },
                );
              }),
            );
            expect(yield* bound.workspace.get).toEqual(
              Option.some({
                id: workspace.id,
                name: workspace.name,
                createdBy: workspace.createdBy,
                ownerMemberId: next,
              }),
            );
            const missing = yield* boundTo(otherWorkspaceId);
            expect(
              yield* Effect.flip(
                missing.store.transaction(
                  missing.workspace.transferOwnership({
                    ...change,
                    workspaceId: otherWorkspaceId,
                  }),
                ),
              ),
            ).toMatchObject({ _tag: "WorkspaceStore.Conflict" });
            const expired = yield* bound.store.transaction(Effect.context<Store.Transaction>());
            expect(
              yield* Effect.flip(
                bound.workspace.transferOwnership(change).pipe(Effect.provide(expired)),
              ),
            ).toMatchObject({ _tag: "WorkspaceStore.Failure" });
          }),
        ),
      ),
    );

    it.effect(
      "member storage keeps one active membership per identity and never reuses a member ID",
      () =>
        fixture.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const workspace = yield* initialized(bound);
              const member = (
                id: string,
                identity: Identity.MemberReference = bob,
              ): Member.Member => ({
                id: Member.Id.make(id),
                workspaceId,
                identity,
                name: Member.Name.make(identity.id),
                status: "active",
              });
              // Each refused write gets its own transaction: a database may abort the rest of one.
              const refused = (record: Member.Member) =>
                Effect.flip(bound.store.transaction(bound.members.insert(record)));
              yield* bound.store.transaction(bound.members.insert(member("bob-first")));
              for (const record of [
                member("bob-second"),
                member("bob-first", charlie),
                member(workspace.ownerMemberId, charlie),
                Object.assign({}, member("foreign", charlie), { workspaceId: otherWorkspaceId }),
                Object.assign({}, member("inactive", charlie), { status: "removed" as const }),
              ])
                expect(yield* refused(record)).toMatchObject({
                  _tag: "MemberStore.Conflict",
                  operation: "insert",
                });
              yield* bound.store.transaction(
                bound.members.markRemoved(Member.Id.make("bob-first")),
              );
              for (const id of ["bob-first", "missing"])
                expect(
                  yield* Effect.flip(
                    bound.store.transaction(bound.members.markRemoved(Member.Id.make(id))),
                  ),
                ).toMatchObject({ _tag: "MemberStore.Conflict", operation: "markRemoved" });
              // A removed membership frees its identity but keeps its ID.
              expect(yield* refused(member("bob-first"))).toMatchObject({
                _tag: "MemberStore.Conflict",
              });
              yield* bound.store.transaction(bound.members.insert(member("bob-second")));
              expect(yield* bound.members.findActive(bob)).toEqual(
                Option.some(member("bob-second")),
              );
              expect(
                (yield* bound.members.list).map(({ id, status }) => [String(id), status]),
              ).toEqual(
                [
                  ["bob-first", "removed"],
                  ["bob-second", "active"],
                  [String(workspace.ownerMemberId), "active"],
                ].toSorted(([left], [right]) => (left! < right! ? -1 : 1)),
              );
            }),
          ),
        ),
    );

    it.effect(
      "workspace, role, and assignment storage refuse reused IDs, including revoked ones",
      () =>
        fixture.withStorage((storage) =>
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId);
              const { workspace, role } = yield* seed(bound);
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.workspace.insert(Object.assign({}, workspace, { name: "Second" })),
                  ),
                ),
              ).toMatchObject({ _tag: "WorkspaceStore.Conflict", operation: "insert" });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(
                    bound.roles.insert(Object.assign({}, role, { name: "Another" })),
                  ),
                ),
              ).toMatchObject({ _tag: "RoleStore.Conflict", operation: "insert" });
              expect(
                yield* Effect.flip(
                  bound.store.transaction(bound.roles.rename(Role.Id.make("missing"), "Missing")),
                ),
              ).toMatchObject({ _tag: "RoleStore.Conflict", operation: "rename" });
              const assignment: Assignment.Assignment = {
                id: Assignment.Id.make("reused"),
                workspaceId,
                memberId: workspace.ownerMemberId,
                status: "active",
                source: source(
                  "Role",
                  localScope("Workspace", workspaceId, workspace.ownerMemberId),
                ),
              };
              yield* bound.store.transaction(bound.assignments.insert(assignment));
              yield* bound.store.transaction(bound.assignments.markRevoked(assignment.id));
              for (const operation of [
                bound.assignments.insert(assignment),
                bound.assignments.markRevoked(assignment.id),
                bound.assignments.markRevoked(Assignment.Id.make("missing")),
              ])
                expect(yield* Effect.flip(bound.store.transaction(operation))).toMatchObject({
                  _tag: "AssignmentStore.Conflict",
                });
              expect(yield* bound.assignments.get(assignment.id)).toEqual(
                Option.some(Object.assign({}, assignment, { status: "revoked" })),
              );
              expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
              expect(yield* bound.roles.get(role.id)).toEqual(Option.some(role));
            }),
          ),
        ),
    );

    it.effect("the live register keeps one version per projection name for each log", () =>
      fixture.withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const bound = yield* boundTo(workspaceId);
            const other = yield* boundTo(otherWorkspaceId);
            const logId = Entry.LogId.make("register-contract");
            const otherLog = Entry.LogId.make("register-other");
            const versions = [
              { name: "first", version: 1 },
              { name: "second", version: 2 },
            ];
            const sorted = (live: ReadonlyArray<Checkpoint.LiveVersion>) =>
              live.toSorted((left, right) => (left.name < right.name ? -1 : 1));
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
            // Writes join the caller's transaction and never run without one.
            expect(
              yield* Effect.flip(
                bound.checkpoints
                  .setLive(logId, versions)
                  .pipe(
                    Effect.provide(
                      yield* bound.store.transaction(Effect.context<Store.Transaction>()),
                    ),
                  ),
              ),
            ).toMatchObject({ _tag: "JournalStore.Failure" });
            yield* bound.store.transaction(bound.checkpoints.setLive(logId, versions));
            expect(sorted(yield* bound.checkpoints.listLive(logId))).toEqual(versions);
            expect(yield* bound.checkpoints.listLive(otherLog)).toEqual([]);
            expect(yield* other.checkpoints.listLive(logId)).toEqual([]);
            // Two versions of one name conflict before any change.
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  bound.checkpoints.setLive(logId, [
                    { name: "first", version: 1 },
                    { name: "first", version: 2 },
                  ]),
                ),
              ),
            ).toMatchObject({ _tag: "JournalStore.Conflict", operation: "checkpoint.setLive" });
            expect(sorted(yield* bound.checkpoints.listLive(logId))).toEqual(versions);
            // A set replaces the whole register, and a rolled-back one changes nothing.
            yield* bound.store.transaction(
              bound.checkpoints.setLive(logId, [{ name: "first", version: 2 }]),
            );
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([
              { name: "first", version: 2 },
            ]);
            expect(
              yield* Effect.flip(
                bound.store.transaction(
                  Effect.andThen(bound.checkpoints.setLive(logId, []), Effect.fail("undo")),
                ),
              ),
            ).toBe("undo");
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([
              { name: "first", version: 2 },
            ]);
            // Staged changes are visible inside their transaction.
            yield* bound.store.transaction(
              Effect.gen(function* () {
                yield* bound.checkpoints.setLive(logId, []);
                expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
              }),
            );
            expect(yield* bound.checkpoints.listLive(logId)).toEqual([]);
          }),
        ),
      ),
    );
    it.effect(
      "stores keep IDs unique, one active record per subject, and timelines contiguous",
      () =>
        fixture.withStorage((storage) =>
          Effect.gen(function* () {
            const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
            const workspace = yield* initialized(bound);
            const owner = Actor.Actor.of({
              workspaceId,
              memberId: workspace.ownerMemberId,
              identity: alice,
            });
            const human = Actor.Actor.of({
              workspaceId,
              memberId: Member.Id.make("human"),
              identity: bob,
            });
            yield* Support.seed(bound, [human], [human]);
            const as = <A, E, R>(actor: Actor.Actor["Service"], program: Effect.Effect<A, E, R>) =>
              program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)));
            const group = yield* as(
              owner,
              Effect.flatMap(GroupService.GroupService, (groupService) =>
                groupService.createTeam({
                  name: "Team",
                  memberIds: [owner.memberId, human.memberId],
                }),
              ),
            );
            const started = yield* as(
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startInGroup({
                  groupId: group.id,
                  text: "Hello",
                  mentions: [human.memberId],
                }),
              ),
            ).pipe(Effect.flatMap(placedIn(bound)));
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(group.id, human.memberId),
            );
            const participation = (yield* bound.participations.listByThread(
              started.thread.id,
            )).find(
              (candidate) => ThreadParticipation.memberOf(candidate.participant) === human.memberId,
            );
            if (participation === undefined) return yield* Effect.die("Missing participant");
            const refused = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              Effect.flip(bound.store.transaction(program));
            const write = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              bound.store.transaction(program);

            // Groups and admissions: a reused ID, and one active admission per group and member.
            const stored = Option.getOrThrow(yield* bound.groups.get(group.id));
            expect(yield* refused(bound.groups.insert(stored))).toMatchObject({
              _tag: "GroupStore.Conflict",
            });
            for (const duplicate of [
              admission,
              Object.assign({}, admission, { id: GroupMembership.Id.make("another-admission") }),
            ])
              expect(yield* refused(bound.groupMemberships.insert(duplicate))).toMatchObject({
                _tag: "GroupMembershipStore.Conflict",
              });

            // Follows: a reused ID, and one active follow per admission.
            const follow = {
              id: GroupFollow.Id.make("follow"),
              workspaceId,
              groupId: group.id,
              memberId: human.memberId,
              groupMembershipId: admission.id,
              followedAt: admission.admittedAt,
              status: "active",
              endedAt: null,
            } satisfies GroupFollow.GroupFollow;
            yield* write(bound.groupFollows.insert(follow));
            for (const duplicate of [
              follow,
              Object.assign({}, follow, { id: GroupFollow.Id.make("second-follow") }),
            ])
              expect(yield* refused(bound.groupFollows.insert(duplicate))).toMatchObject({
                _tag: "GroupFollowStore.Conflict",
              });
            expect(yield* bound.groupFollows.listActiveByGroup(group.id)).toEqual([follow]);

            // Threads, participations, and messages: a reused ID, and one active participation
            // per participant in a thread.
            expect(yield* refused(bound.threads.insert(started.thread))).toMatchObject({
              _tag: "ThreadStore.Conflict",
            });
            for (const duplicate of [
              participation,
              Object.assign({}, participation, {
                id: ThreadParticipation.Id.make("duplicate-participation"),
              }),
            ])
              expect(yield* refused(bound.participations.insert(duplicate))).toMatchObject({
                _tag: "ThreadParticipationStore.Conflict",
              });
            expect(yield* refused(bound.messages.insert(started.message))).toMatchObject({
              _tag: "ThreadMessageStore.Conflict",
            });

            // Timelines: contiguous positions, and one activity per subject.
            const message = Object.assign({}, started.message, {
              id: ThreadMessage.Id.make("direct-message"),
            });
            yield* write(bound.messages.insert(message));
            const published = (id: string, messageId: ThreadMessage.Id, sequence: number) =>
              ThreadActivityKind.makeRecordUnsafe(
                ThreadMessageActivity.Published,
                {
                  id: ThreadActivity.Id.make(id),
                  workspaceId,
                  threadId: started.thread.id,
                  sequence,
                  occurredAt: started.activity.occurredAt,
                },
                { messageId },
              );
            for (const misplaced of [
              published("reused-position", message.id, 1),
              published("gap", message.id, 3),
              published("same-subject", started.message.id, 2),
            ])
              expect(yield* refused(bound.activities.insert(misplaced))).toMatchObject({
                _tag: "ThreadActivityStore.Conflict",
              });
            yield* write(bound.activities.insert(published("next", message.id, 2)));
            expect(
              (yield* bound.activities.listByThread(started.thread.id)).map(
                ({ sequence }) => sequence,
              ),
            ).toEqual([1, 2]);
          }),
        ),
    );

    it.effect("turn storage keeps one active turn per agent and thread, inserted or updated", () =>
      fixture.withStorage((storage) =>
        Effect.gen(function* () {
          const bound = yield* forWorkspace(yield* storage.connect(), workspaceId);
          yield* initialized(bound);
          const createdAt = yield* DateTime.now;
          const turn = (id: string, status: Turn.Status, thread = "thread"): Turn.Turn => ({
            id: Turn.Id.make(id),
            workspaceId,
            groupId: Group.GeneralId,
            threadId: ThreadId.Id.make(thread),
            agentId: Identity.AgentId.make("agent"),
            memberId: Member.Id.make("agent-member"),
            participationId: ThreadParticipation.Id.make(`${thread}-participation`),
            retry: null,
            status,
            acceptedThroughSequence: 1,
            logAfter: 0,
            selection: null,
            messageIds: [],
            failure: null,
            cancelReason: null,
            createdAt,
            startedAt: null,
            finishedAt: Turn.active(status) ? null : createdAt,
          });
          const refused = <A, E, R>(program: Effect.Effect<A, E, R>) =>
            Effect.flip(bound.store.transaction(program));
          const write = <A, E, R>(program: Effect.Effect<A, E, R>) =>
            bound.store.transaction(program);
          const conflict = { _tag: "TurnStore.Conflict" };

          // Inserting: a reused ID, and a second active turn of the agent on the thread.
          const first = turn("first", "queued");
          yield* write(bound.turns.insert(first));
          expect(yield* refused(bound.turns.insert(first))).toMatchObject(conflict);
          expect(yield* refused(bound.turns.insert(turn("second", "queued")))).toMatchObject(
            conflict,
          );
          yield* write(bound.turns.insert(turn("elsewhere", "queued", "other-thread")));

          // Updating: a finished turn may not become active while another is.
          const second = turn("second", "failed");
          yield* write(bound.turns.insert(second));
          const reactivated: Turn.Turn = Object.assign({}, second, {
            status: "running" as const,
            finishedAt: null,
          });
          expect(yield* refused(bound.turns.update(reactivated))).toMatchObject(conflict);
          yield* write(
            bound.turns.update(
              Object.assign({}, first, { status: "completed" as const, finishedAt: createdAt }),
            ),
          );
          yield* write(bound.turns.update(reactivated));
          expect(yield* bound.turns.findActive(first.memberId, first.threadId)).toEqual(
            Option.some(reactivated),
          );
        }),
      ),
    );
  });
};
