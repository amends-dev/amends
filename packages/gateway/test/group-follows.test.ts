import { Notification } from "@amends-dev/core/notification";
import { describe, expect, it } from "@effect/vitest";
import { AgentPermissions } from "@amends-dev/core/agent";
import { Assignment, AssignmentFacts, BuiltinRoles, Grant } from "@amends-dev/core/authorization";
import {
  type Group,
  GroupService,
  GroupFollow,
  GroupFollowService,
  GroupMembershipService,
  GroupPermissions,
} from "@amends-dev/core/group";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Entry, Journal, Publication } from "@amends-dev/core/journal";
import {
  type Thread,
  ThreadService,
  ThreadParticipation,
  ThreadPermissions,
} from "@amends-dev/core/thread";
import { Member, MemberFacts } from "@amends-dev/core/workspace";
import { DateTime, Effect, Option } from "effect";
import * as Support from "./support.ts";
import {
  type Bound,
  boundTo,
  listOldestFirst,
  otherWorkspaceId,
  runHost,
  testProvenance,
  workspaceId,
} from "./support.ts";
import { withStorage } from "./fixture.ts";
import { CoreError } from "@amends-dev/core/error";

/** Following groups: joining later threads, ending with the admission, and storage constraints. */

const { core, initialized } = Support;
describe("group follows", () => {
  const humanId = Member.Id.make("human");
  const plainId = Member.Id.make("plain");
  const outsiderId = Member.Id.make("outsider");
  const agentId = Member.Id.make("agent");
  const identityOf = (memberId: Member.Id): Identity.MemberReference =>
    memberId === agentId
      ? { _tag: "Agent", id: Identity.AgentId.make(memberId) }
      : { _tag: "Human", id: Identity.HumanId.make(memberId) };
  const actorFor = (memberId: Member.Id) =>
    Actor.Actor.of({ workspaceId, memberId, identity: identityOf(memberId) });
  const run = <A, E, R>(
    bound: Bound,
    actor: Actor.Actor["Service"],
    program: Effect.Effect<A, E, R>,
  ) => program.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)));
  const trusted = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
    program.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
      Effect.provide(core(bound)),
    );
  const history = (bound: Bound) => bound.store.read(Entry.LogId.make("journal"), { limit: 500 });
  const follow = (groupId: Group.Id, memberId: Member.Id) =>
    Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
      groupFollowService.follow({ groupId, memberId }),
    );
  const unfollow = (groupId: Group.Id, memberId: Member.Id) =>
    Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
      groupFollowService.unfollow({ groupId, memberId }),
    );
  const post = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id> = []) =>
    Effect.flatMap(ThreadService.ThreadService, (threadService) =>
      threadService.startInGroup({ groupId, text: "Update", mentions }),
    );
  const participantsOf = (bound: Bound, started: Thread.Started) =>
    Effect.map(bound.participations.listByThread(started.thread.id), (records) =>
      records
        .filter((record) => record.status === "active")
        .flatMap((record) => ThreadParticipation.memberOf(record.participant) ?? [])
        .sort(),
    );
  const inbox = (bound: Bound, memberId: Member.Id) =>
    listOldestFirst(bound.notifications, Notification.ofMember(memberId, identityOf(memberId)), {
      limit: 100,
    });
  /**
   * A team of the owner, a Viewer (`human`), a member with no role but a start grant on the team
   * (`plain`), and an agent; and a Viewer outside the team.
   */
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId);
    const workspace = yield* initialized(bound);
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy },
    });
    yield* trusted(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.forEach([humanId, plainId, outsiderId, agentId], (memberId) =>
            Effect.andThen(
              journal.publish(MemberFacts.Added, {
                workspaceId,
                memberId,
                identity: identityOf(memberId),
                name: Member.Name.make(memberId),
              }),
              memberId === humanId || memberId === outsiderId
                ? journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.Id.make(`viewer-${memberId}`),
                    memberId,
                    source: {
                      _tag: "Role",
                      roleId: BuiltinRoles.MemberId,
                      scope: { _tag: "Workspace", workspaceId },
                    },
                  })
                : Effect.void,
            ),
          ),
        ),
      ),
    );
    const team = yield* run(
      bound,
      owner,
      Effect.flatMap(GroupService.GroupService, (groupService) =>
        groupService.createTeam({
          name: "Team",
          memberIds: [owner.memberId, humanId, plainId, agentId],
        }),
      ),
    );
    yield* trusted(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.publish(AssignmentFacts.Created, {
          workspaceId,
          assignmentId: Assignment.Id.make("plain-start"),
          memberId: plainId,
          source: {
            _tag: "Direct",
            grant: Grant.make(ThreadPermissions.Start, {
              _tag: "Target",
              target: { _tag: "Group", workspaceId, groupId: team.id },
            }),
          },
        }),
      ),
    );
    return { bound, owner, team };
  });

  it.effect("following a team group joins its new threads until the member unfollows", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare();
          const human = actorFor(humanId);
          const earlier = yield* run(bound, owner, post(team.id));
          yield* run(bound, human, follow(team.id, humanId));
          // Following again records nothing, and existing threads are not joined.
          const settled = yield* history(bound);
          yield* run(bound, human, follow(team.id, humanId));
          expect(yield* history(bound)).toEqual(settled);
          expect(yield* participantsOf(bound, earlier)).toEqual([owner.memberId]);
          const followed = yield* run(bound, owner, post(team.id));
          expect(yield* participantsOf(bound, followed)).toEqual([owner.memberId, humanId].sort());
          expect(yield* inbox(bound, humanId)).toHaveLength(1);
          expect(yield* inbox(bound, plainId)).toEqual([]);
          // Followers join a mentioned post too, and mentions still select who is notified.
          const mentioned = yield* run(bound, owner, post(team.id, [plainId]));
          expect(yield* participantsOf(bound, mentioned)).toEqual(
            [owner.memberId, humanId, plainId].sort(),
          );
          expect(yield* inbox(bound, humanId)).toHaveLength(1);
          expect(yield* inbox(bound, plainId)).toHaveLength(1);
          yield* run(bound, human, unfollow(team.id, humanId));
          const unfollowed = yield* history(bound);
          yield* run(bound, human, unfollow(team.id, humanId));
          expect(yield* history(bound)).toEqual(unfollowed);
          expect(yield* participantsOf(bound, yield* run(bound, owner, post(team.id)))).toEqual([
            owner.memberId,
          ]);
          // Unfollowing the group leaves current thread participation as it was.
          expect(yield* participantsOf(bound, followed)).toContain(humanId);
        }),
      ),
    ),
  );

  it.effect(
    "an agent follows on behalf of someone who may use it and then joins member posts",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, team } = yield* prepare();
            const plain = actorFor(plainId);
            const before = yield* history(bound);
            expect(yield* Effect.flip(run(bound, owner, follow(team.id, humanId)))).toEqual(
              new CoreError.Denied({ reason: new CoreError.AgentRequired({ memberId: humanId }) }),
            );
            expect(yield* Effect.flip(run(bound, plain, follow(team.id, agentId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: {
                _tag: "NotGranted",
                requirement: { permission: { name: AgentPermissions.Use.name } },
              },
            });
            expect(yield* Effect.flip(run(bound, owner, follow(team.id, outsiderId)))).toEqual(
              new CoreError.Conflict({
                reason: new CoreError.ParticipantUnavailable({ memberId: outsiderId }),
              }),
            );
            expect(yield* history(bound)).toEqual(before);
            yield* run(bound, owner, follow(team.id, agentId));
            // A member who may not use the agent reaches it by posting, but cannot mention it.
            const reached = yield* run(bound, plain, post(team.id));
            expect(yield* participantsOf(bound, reached)).toEqual([agentId, plainId].sort());
            expect(yield* inbox(bound, agentId)).toHaveLength(1);
            expect(yield* Effect.flip(run(bound, plain, post(team.id, [agentId])))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" },
            });
            expect(yield* Effect.flip(run(bound, plain, unfollow(team.id, agentId)))).toMatchObject(
              { _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } },
            );
            yield* run(bound, owner, unfollow(team.id, agentId));
            expect(yield* participantsOf(bound, yield* run(bound, plain, post(team.id)))).toEqual([
              plainId,
            ]);
          }),
        ),
      ),
  );

  it.effect(
    "following needs group.follow and a team group, ends with the admission, and replays",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, owner, team } = yield* prepare();
            const human = actorFor(humanId);
            expect(
              yield* Effect.flip(run(bound, actorFor(plainId), follow(team.id, plainId))),
            ).toMatchObject({
              _tag: "CoreError.Denied",
              reason: {
                _tag: "NotGranted",
                requirement: { permission: { name: GroupPermissions.Follow.name } },
              },
            });
            expect(
              yield* Effect.flip(run(bound, actorFor(outsiderId), follow(team.id, outsiderId))),
            ).toEqual(new CoreError.NotFound({ resource: "Group", id: team.id }));
            const direct = yield* run(
              bound,
              owner,
              Effect.flatMap(ThreadService.ThreadService, (threadService) =>
                threadService.startDirect({
                  memberIds: [humanId],
                  text: "Hello",
                  mentions: [],
                }),
              ),
            );
            expect(
              yield* Effect.flip(run(bound, owner, follow(direct.thread.groupId, owner.memberId))),
            ).toEqual(
              new CoreError.Invalid({
                reason: new CoreError.NotFollowable({ groupId: direct.thread.groupId }),
              }),
            );
            // Leaving the group ends the follow; joining again does not restore it.
            yield* run(bound, human, follow(team.id, humanId));
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(team.id, humanId),
            );
            const followed = Option.getOrThrow(yield* bound.groupFollows.findActive(admission.id));
            yield* run(
              bound,
              human,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.leave({
                    groupId: team.id,
                    membershipId: admission.id,
                  }),
              ),
            );
            expect(yield* bound.groupFollows.get(followed.id)).toMatchObject({
              value: { status: "ended" },
            });
            yield* run(
              bound,
              owner,
              Effect.flatMap(
                GroupMembershipService.GroupMembershipService,
                (groupMembershipService) =>
                  groupMembershipService.add({ groupId: team.id, memberId: humanId }),
              ),
            );
            expect(yield* participantsOf(bound, yield* run(bound, owner, post(team.id)))).toEqual([
              owner.memberId,
            ]);
            // Replay rebuilds follows from the journal, including the ending caused by leaving.
            const saved = yield* bound.groupFollows.get(followed.id);
            yield* storage.discardProjections;
            yield* trusted(
              bound,
              Effect.flatMap(Journal.Journal, (journal) => journal.replay),
            );
            expect(yield* bound.groupFollows.get(followed.id)).toEqual(saved);
          }),
        ),
      ),
  );

  it.effect(
    "group follow storage keeps one active follow per admission and rejects invalid records",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, team } = yield* prepare();
            const admission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(team.id, humanId),
            );
            const plainAdmission = Option.getOrThrow(
              yield* bound.groupMemberships.findActive(team.id, plainId),
            );
            const followedAt = DateTime.makeUnsafe("2026-09-23T12:00:00.000Z");
            const record = (id: string, changes: Partial<GroupFollow.GroupFollow> = {}) =>
              Object.assign(
                {
                  id: GroupFollow.Id.make(id),
                  workspaceId,
                  groupId: team.id,
                  memberId: humanId,
                  groupMembershipId: admission.id,
                  followedAt,
                  status: "active" as const,
                  endedAt: null,
                },
                changes,
              );
            const write = <A, E, R>(program: Effect.Effect<A, E, R>) =>
              bound.store.transaction(program);
            yield* write(bound.groupFollows.insert(record("first")));
            for (const bad of [
              record("second"),
              record("first", { memberId: plainId, groupMembershipId: plainAdmission.id }),
              record("foreign", { workspaceId: otherWorkspaceId }),
              record("ended", { status: "ended", endedAt: followedAt }),
            ])
              expect(yield* Effect.flip(write(bound.groupFollows.insert(bad)))).toMatchObject({
                _tag: "StoreError",
                store: "GroupFollowStore",
                reason: { _tag: "Rejected" },
              });
            expect(yield* bound.groupFollows.listActiveByGroup(team.id)).toEqual([record("first")]);
            expect(yield* bound.groupFollows.findActive(admission.id)).toEqual(
              Option.some(record("first")),
            );
            const ending: GroupFollow.Ending = {
              workspaceId,
              groupId: team.id,
              followId: GroupFollow.Id.make("first"),
              memberId: humanId,
            };
            for (const bad of [
              Object.assign({}, ending, { memberId: plainId }),
              Object.assign({}, ending, { followId: GroupFollow.Id.make("missing") }),
              Object.assign({}, ending, { workspaceId: otherWorkspaceId }),
            ])
              expect(
                yield* Effect.flip(write(bound.groupFollows.end(bad, followedAt))),
              ).toMatchObject({
                _tag: "StoreError",
                store: "GroupFollowStore",
                reason: { _tag: "Rejected" },
              });
            yield* write(bound.groupFollows.end(ending, followedAt));
            expect(
              yield* Effect.flip(write(bound.groupFollows.end(ending, followedAt))),
            ).toMatchObject({
              _tag: "StoreError",
              store: "GroupFollowStore",
              reason: { _tag: "Rejected" },
            });
            expect(yield* bound.groupFollows.get(ending.followId)).toEqual(
              Option.some(record("first", { status: "ended", endedAt: followedAt })),
            );
            expect(yield* bound.groupFollows.findActive(admission.id)).toEqual(Option.none());
            // Following again after an ending uses a fresh follow.
            yield* write(bound.groupFollows.insert(record("second")));
            const foreign = yield* boundTo(otherWorkspaceId);
            expect(yield* foreign.groupFollows.listActiveByGroup(team.id)).toEqual([]);
          }),
        ),
      ),
  );
});
