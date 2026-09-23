import { describe, expect, it } from "@effect/vitest";
import { ReadState, ReadStateApplication } from "@amends/core/attention";
import { Assignment, AssignmentFacts, BuiltinRoles, Grant } from "@amends/core/authorization";
import {
  Group,
  GroupApplication,
  GroupFollowApplication,
  GroupMembershipApplication,
} from "@amends/core/group";
import { Actor, Identity } from "@amends/core/identity";
import { Journal, Log, Publication } from "@amends/core/journal";
import {
  Thread,
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
  ThreadPermissions,
} from "@amends/core/thread";
import { Member, MemberFacts } from "@amends/core/workspace";
import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";
import { SqlClient } from "effect/unstable/sql";
import {
  setup,
  boundTo,
  initialized,
  inDatabase,
  core,
  type Bound,
  workspaceId,
  otherWorkspaceId,
  testProvenance,
} from "./support.ts";

const humanId = Member.Id.make("human");
const otherId = Member.Id.make("other");
const plainId = Member.Id.make("plain");
const outsiderId = Member.Id.make("outsider");
const agentId = Member.Id.make("agent");
const identityOf = (memberId: Member.Id): Identity.MemberReference =>
  memberId === agentId
    ? { _tag: "Agent", id: Identity.AgentId.make(memberId) }
    : { _tag: "Human", id: Identity.HumanId.make(memberId) };
const actorFor = (memberId: Member.Id) =>
  Actor.Value.make({ workspaceId, memberId, identity: identityOf(memberId) });
const run = <A, E, R>(bound: Bound, actor: Actor.Value, program: Effect.Effect<A, E, R>) =>
  program.pipe(Effect.provideService(Actor.Service, actor), Effect.provide(core(bound)));
const trusted = <A, E, R>(bound: Bound, program: Effect.Effect<A, E, R>) =>
  program.pipe(
    Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
    Effect.provide(core(bound)),
  );
const history = (bound: Bound) => bound.store.read(Log.Id.make("journal"), { limit: 500 });
const start = (groupId: Group.Id, mentions: ReadonlyArray<Member.Id>) =>
  Effect.flatMap(ThreadApplication.Service, (s) =>
    s.startInGroup({ groupId, text: "Opening", mentions }),
  );
const reply = (threadId: Thread.Id, mentions: ReadonlyArray<Member.Id>) =>
  Effect.flatMap(ThreadMessageApplication.Service, (s) =>
    s.publish({ threadId, text: "Reply", mentions }),
  );
const markRead = (threadId: Thread.Id, throughSequence: number) =>
  Effect.flatMap(ReadStateApplication.Service, (s) =>
    s.markThreadRead({ threadId, throughSequence }),
  );
const markGroupRead = (groupId: Group.Id) =>
  Effect.flatMap(ReadStateApplication.Service, (s) => s.markGroupRead({ groupId }));
const pending = (bound: Bound, memberId: Member.Id) =>
  Effect.map(
    bound.notifications.listPendingByRecipient(identityOf(memberId), { limit: 100 }),
    (records) => records.map((record) => record.thread?.sequence ?? 0).toSorted((a, b) => a - b),
  );
const positionOf = (bound: Bound, memberId: Member.Id, threadId: Thread.Id) =>
  Effect.map(bound.readStates.getThreadPositions(memberId, [threadId]), (positions) =>
    positions.map((position) => position.readThrough),
  );
/**
 * A team of the owner, two Viewers (`human`, `other`), a member with no role (`plain`), and an
 * agent; and a Viewer outside the team.
 */
const prepare = Effect.fnUntraced(function* () {
  const bound = yield* boundTo(workspaceId);
  const workspace = yield* initialized(bound);
  const owner = Actor.Value.make({
    workspaceId,
    memberId: workspace.ownerMemberId,
    identity: { _tag: "Human", id: workspace.createdBy },
  });
  yield* trusted(
    bound,
    Effect.flatMap(Journal.Service, (journal) =>
      journal.commit(
        Effect.forEach([humanId, otherId, plainId, outsiderId, agentId], (memberId) =>
          Effect.andThen(
            journal.publish(MemberFacts.Added, {
              workspaceId,
              memberId,
              identity: identityOf(memberId),
            }),
            memberId === plainId || memberId === agentId
              ? Effect.void
              : journal.publish(AssignmentFacts.Created, {
                  workspaceId,
                  assignmentId: Assignment.Id.make(`viewer-${memberId}`),
                  memberId,
                  source: {
                    _tag: "Role",
                    roleId: BuiltinRoles.ViewerId,
                    scope: { _tag: "Workspace", workspaceId },
                  },
                }),
          ),
        ),
      ),
    ),
  );
  const team = yield* run(
    bound,
    owner,
    Effect.flatMap(GroupApplication.Service, (s) =>
      s.createPrivateTeam({
        name: "Team",
        memberIds: [owner.memberId, humanId, otherId, plainId, agentId],
      }),
    ),
  );
  return { bound, owner, team };
});

const { available, withDatabase } = setup();

describe.skipIf(!available)("PostgreSQL read state", () => {
  it.effect("messages advance a thread's and group's latest activity; quiet changes do not", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare();
          yield* TestClock.adjust("1 minute");
          const started = yield* run(bound, owner, start(team.id, [humanId]));
          const opened = yield* DateTime.now;
          expect(yield* bound.threads.getLatest([started.thread.id])).toEqual([
            { threadId: started.thread.id, sequence: 1, occurredAt: opened },
          ]);
          expect(yield* bound.groups.getLatest([team.id])).toEqual([
            { groupId: team.id, occurredAt: opened },
          ]);
          // Following records quiet activity at sequence 2, which is not new content.
          yield* TestClock.adjust("1 minute");
          yield* run(
            bound,
            actorFor(otherId),
            Effect.flatMap(ThreadParticipationApplication.Service, (s) =>
              s.follow(started.thread.id),
            ),
          );
          expect(yield* bound.threads.getLatest([started.thread.id])).toMatchObject([
            { sequence: 1 },
          ]);
          yield* TestClock.adjust("1 minute");
          yield* run(bound, owner, reply(started.thread.id, [humanId]));
          const replied = yield* DateTime.now;
          expect(yield* bound.threads.getLatest([started.thread.id])).toEqual([
            { threadId: started.thread.id, sequence: 3, occurredAt: replied },
          ]);
          expect(yield* bound.groups.getLatest([team.id])).toEqual([
            { groupId: team.id, occurredAt: replied },
          ]);
          // Earlier positions and times change nothing; missing records conflict.
          yield* bound.store.transaction(
            Effect.andThen(
              bound.threads.recordLatest({
                threadId: started.thread.id,
                sequence: 2,
                occurredAt: opened,
              }),
              bound.groups.recordLatest({ groupId: team.id, occurredAt: opened }),
            ),
          );
          expect(yield* bound.threads.getLatest([started.thread.id])).toMatchObject([
            { sequence: 3 },
          ]);
          expect(yield* bound.groups.getLatest([team.id])).toEqual([
            { groupId: team.id, occurredAt: replied },
          ]);
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.threads.recordLatest({
                  threadId: Thread.Id.make("missing"),
                  sequence: 1,
                  occurredAt: opened,
                }),
              ),
            ),
          ).toMatchObject({ _tag: "ThreadStore.Conflict" });
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                bound.groups.recordLatest({
                  groupId: Group.Id.make("missing"),
                  occurredAt: opened,
                }),
              ),
            ),
          ).toMatchObject({ _tag: "GroupStore.Conflict" });
          expect(
            yield* bound.threads.getLatest([started.thread.id, Thread.Id.make("missing")]),
          ).toHaveLength(1);
          expect(yield* bound.threads.getLatest([])).toEqual([]);
          expect(yield* bound.groups.getLatest([])).toEqual([]);
        }),
      ),
    ),
  );

  it.effect(
    "marking a thread read moves forward only and settles the reader's inbox up to it",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, team } = yield* prepare();
            const human = actorFor(humanId);
            const started = yield* run(bound, owner, start(team.id, [humanId]));
            const threadId = started.thread.id;
            yield* run(bound, owner, reply(threadId, [humanId]));
            yield* run(bound, owner, reply(threadId, [humanId]));
            expect(yield* pending(bound, humanId)).toEqual([1, 2, 3]);
            const before = yield* history(bound);
            yield* run(bound, human, markRead(threadId, 2));
            expect(yield* positionOf(bound, humanId, threadId)).toEqual([2]);
            expect(yield* pending(bound, humanId)).toEqual([3]);
            // Two acknowledgments, committed together with the position.
            expect((yield* history(bound)).length).toBe(before.length + 1);
            // An earlier position changes nothing and, with nothing to settle, writes no commit.
            const settled = yield* history(bound);
            yield* run(bound, human, markRead(threadId, 1));
            expect(yield* positionOf(bound, humanId, threadId)).toEqual([2]);
            expect(yield* history(bound)).toEqual(settled);
            expect(yield* Effect.flip(run(bound, human, markRead(threadId, 4)))).toEqual(
              new ReadStateApplication.BeyondTimeline({
                threadId,
                throughSequence: 4,
                latestSequence: 3,
              }),
            );
            yield* run(bound, human, markRead(threadId, 3));
            expect(yield* positionOf(bound, humanId, threadId)).toEqual([3]);
            expect(yield* pending(bound, humanId)).toEqual([]);
            // A member reading a thread they take no part in keeps only a position.
            const read = yield* history(bound);
            yield* run(bound, actorFor(otherId), markRead(threadId, 3));
            expect(yield* positionOf(bound, otherId, threadId)).toEqual([3]);
            expect(yield* history(bound)).toEqual(read);
            // Only people with current read access keep read state.
            expect(
              yield* Effect.flip(run(bound, actorFor(agentId), markRead(threadId, 1))),
            ).toEqual(new ReadStateApplication.HumanRequired({ memberId: agentId }));
            expect(
              yield* Effect.flip(run(bound, actorFor(outsiderId), markRead(threadId, 1))),
            ).toEqual(new ReadStateApplication.ThreadNotFound({ threadId }));
            expect(
              yield* Effect.flip(run(bound, actorFor(plainId), markRead(threadId, 1))),
            ).toMatchObject({ _tag: "Authorization.Denied" });
            expect(yield* positionOf(bound, plainId, threadId)).toEqual([]);
          }),
        ),
      ),
  );

  it.effect("marking a group read records a caught-up time that only moves forward", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, team } = yield* prepare();
          const human = actorFor(humanId);
          const caughtUp = Effect.map(
            bound.readStates.getGroupsCaughtUp(humanId, [team.id]),
            (times) => times.map((time) => time.caughtUpAt),
          );
          yield* TestClock.adjust("1 minute");
          yield* run(bound, human, markGroupRead(team.id));
          const first = yield* DateTime.now;
          expect(yield* caughtUp).toEqual([first]);
          yield* TestClock.adjust("1 minute");
          yield* run(bound, human, markGroupRead(team.id));
          const second = yield* DateTime.now;
          expect(yield* caughtUp).toEqual([second]);
          yield* bound.readStates.advanceGroup({
            workspaceId,
            memberId: humanId,
            groupId: team.id,
            caughtUpAt: first,
          });
          expect(yield* caughtUp).toEqual([second]);
          expect(yield* Effect.flip(run(bound, actorFor(agentId), markGroupRead(team.id)))).toEqual(
            new ReadStateApplication.HumanRequired({ memberId: agentId }),
          );
          expect(
            yield* Effect.flip(run(bound, actorFor(outsiderId), markGroupRead(team.id))),
          ).toEqual(new ReadStateApplication.GroupNotFound({ groupId: team.id }));
        }),
      ),
    ),
  );

  it.effect("read-state storage keeps the later value, inside or outside a transaction", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare();
          const started = yield* run(bound, owner, start(team.id, []));
          const threadId = started.thread.id;
          const position = (readThrough: number, changes: Partial<ReadState.ThreadPosition> = {}) =>
            Object.assign({ workspaceId, memberId: humanId, threadId, readThrough }, changes);
          yield* bound.readStates.advanceThread(position(2));
          yield* bound.store.transaction(bound.readStates.advanceThread(position(1)));
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([2]);
          yield* bound.store.transaction(bound.readStates.advanceThread(position(5)));
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([5]);
          // A rolled-back transaction takes its write with it.
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                Effect.andThen(bound.readStates.advanceThread(position(9)), Effect.fail("undo")),
              ),
            ),
          ).toBe("undo");
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([5]);
          expect(
            yield* Effect.flip(
              bound.readStates.advanceThread(position(1, { workspaceId: otherWorkspaceId })),
            ),
          ).toMatchObject({ _tag: "ReadStateStore.Conflict" });
          // Read state references no projection rows, so rebuilding threads from the journal keeps it.
          const sql = yield* SqlClient.SqlClient;
          yield* bound.store.transaction(
            Effect.gen(function* () {
              for (const table of [
                "notifications",
                "thread_activities",
                "thread_messages",
                "thread_participations",
                "threads",
              ])
                yield* sql.unsafe(`DELETE FROM ${table}`);
              yield* sql.unsafe(
                "DELETE FROM checkpoints WHERE name IN ('threads','thread.participation','thread.message','thread.activity','notifications')",
              );
            }),
          );
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Service, (journal) => journal.replay),
          );
          expect(yield* bound.threads.getLatest([threadId])).toMatchObject([{ sequence: 1 }]);
          expect(yield* positionOf(bound, humanId, threadId)).toEqual([5]);
          // Positions are per member and per workspace.
          expect(yield* positionOf(bound, otherId, threadId)).toEqual([]);
          expect(yield* bound.readStates.getThreadPositions(humanId, [])).toEqual([]);
          const foreign = yield* boundTo(otherWorkspaceId);
          expect(yield* foreign.readStates.getThreadPositions(humanId, [threadId])).toEqual([]);
        }),
      ),
    ),
  );

  it.effect("group thread lists page by latest activity with each reader's unread state", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare();
          const human = actorFor(humanId);
          const listed = (actor: Actor.Value, options: Thread.ListOptions) =>
            run(
              bound,
              actor,
              Effect.flatMap(ThreadApplication.Service, (s) => s.listInGroup(team.id, options)),
            );
          yield* TestClock.adjust("1 minute");
          const first = yield* run(bound, owner, start(team.id, []));
          yield* TestClock.adjust("1 minute");
          const second = yield* run(bound, owner, start(team.id, []));
          yield* TestClock.adjust("1 minute");
          // Posting reads the thread through the author's own message.
          const own = yield* run(bound, human, start(team.id, []));
          const page = yield* listed(human, { limit: 2 });
          expect(page.map((item) => [item.thread.id, item.unread, item.readThrough])).toEqual([
            [own.thread.id, false, 1],
            [second.thread.id, true, null],
          ]);
          const last = page[1];
          if (last === undefined) return yield* Effect.die("Missing page item");
          const next = yield* listed(human, {
            before: { latestActivityAt: last.latest.occurredAt, threadId: last.thread.id },
            limit: 2,
          });
          expect(next.map((item) => item.thread.id)).toEqual([first.thread.id]);
          // Reading clears unread; a later message moves the thread first and makes it unread again.
          yield* run(bound, human, markRead(second.thread.id, 1));
          yield* TestClock.adjust("1 minute");
          yield* run(bound, owner, reply(first.thread.id, []));
          expect(
            (yield* listed(human, { limit: 10 })).map((item) => [item.thread.id, item.unread]),
          ).toEqual([
            [first.thread.id, true],
            [own.thread.id, false],
            [second.thread.id, false],
          ]);
          // A member who joins later sees earlier activity as read until something new arrives.
          yield* TestClock.adjust("1 minute");
          yield* run(
            bound,
            owner,
            Effect.flatMap(GroupMembershipApplication.Service, (s) =>
              s.add({ groupId: team.id, memberId: outsiderId }),
            ),
          );
          const outsider = actorFor(outsiderId);
          expect((yield* listed(outsider, { limit: 10 })).some((item) => item.unread)).toBe(false);
          yield* TestClock.adjust("1 minute");
          yield* run(bound, owner, reply(second.thread.id, []));
          expect(
            (yield* listed(outsider, { limit: 10 })).filter((item) => item.unread).length,
          ).toBe(1);
          // Threads the reader's grants do not cover are skipped, and the page still fills.
          const plain = actorFor(plainId);
          expect(yield* listed(plain, { limit: 1 })).toEqual([]);
          yield* trusted(
            bound,
            Effect.flatMap(Journal.Service, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.Id.make("plain-reads-own"),
                memberId: plainId,
                source: {
                  _tag: "Direct",
                  grant: Grant.make(ThreadPermissions.Read, {
                    _tag: "Target",
                    target: { _tag: "Thread", workspaceId, threadId: own.thread.id },
                  }),
                },
              }),
            ),
          );
          expect((yield* listed(plain, { limit: 1 })).map((item) => item.thread.id)).toEqual([
            own.thread.id,
          ]);
          expect(
            yield* Effect.flip(
              run(
                bound,
                actorFor(outsiderId),
                Effect.flatMap(ThreadApplication.Service, (s) =>
                  s.listInGroup(Group.Id.make("missing"), { limit: 1 }),
                ),
              ),
            ),
          ).toMatchObject({ _tag: "ThreadApplication.GroupNotFound" });
        }),
      ),
    ),
  );

  it.effect("group lists report latest activity, catching up, and following", () =>
    withDatabase((location) =>
      inDatabase(
        location,
        Effect.gen(function* () {
          const { bound, owner, team } = yield* prepare();
          const human = actorFor(humanId);
          const mine = (actor: Actor.Value) =>
            run(
              bound,
              actor,
              Effect.flatMap(GroupApplication.Service, (s) => s.listMine({ limit: 100 })),
            );
          const quiet = yield* run(
            bound,
            owner,
            Effect.flatMap(GroupApplication.Service, (s) =>
              s.createPrivateTeam({ name: "Quiet", memberIds: [owner.memberId, humanId] }),
            ),
          );
          const itemOf = (items: ReadonlyArray<Group.ListItem>, groupId: Group.Id) =>
            items.find((item) => item.group.id === groupId);
          yield* TestClock.adjust("1 minute");
          yield* run(bound, owner, start(team.id, []));
          const posted = yield* DateTime.now;
          const listed = yield* mine(human);
          expect(listed.map((item) => item.group.id)).toEqual(
            [team.id, quiet.id].toSorted((a, b) => (a < b ? -1 : 1)),
          );
          expect(itemOf(listed, team.id)).toMatchObject({
            latestActivityAt: posted,
            caughtUpAt: null,
            newActivity: true,
            following: false,
          });
          expect(itemOf(listed, quiet.id)).toMatchObject({
            latestActivityAt: null,
            newActivity: false,
          });
          yield* TestClock.adjust("1 minute");
          yield* run(bound, human, markGroupRead(team.id));
          yield* run(
            bound,
            human,
            Effect.flatMap(GroupFollowApplication.Service, (s) =>
              s.follow({ groupId: team.id, memberId: humanId }),
            ),
          );
          expect(itemOf(yield* mine(human), team.id)).toMatchObject({
            caughtUpAt: yield* DateTime.now,
            newActivity: false,
            following: true,
          });
          yield* TestClock.adjust("1 minute");
          yield* run(bound, owner, start(team.id, []));
          expect(itemOf(yield* mine(human), team.id)).toMatchObject({ newActivity: true });
          // Groups outside the reader's group.read grants are left out.
          expect(yield* mine(actorFor(plainId))).toEqual([]);
        }),
      ),
    ),
  );

  it.effect(
    "posting reads the thread through the author's message and settles their earlier notifications",
    () =>
      withDatabase((location) =>
        inDatabase(
          location,
          Effect.gen(function* () {
            const { bound, owner, team } = yield* prepare();
            const started = yield* run(bound, owner, start(team.id, [humanId]));
            yield* run(bound, owner, reply(started.thread.id, [humanId]));
            expect(yield* pending(bound, humanId)).toEqual([1, 2]);
            const replied = yield* run(bound, actorFor(humanId), reply(started.thread.id, []));
            expect(replied.activity.sequence).toBe(3);
            expect(yield* pending(bound, humanId)).toEqual([]);
            expect(yield* positionOf(bound, humanId, started.thread.id)).toEqual([3]);
            // The reply notified the others, never its author.
            expect(
              (yield* bound.notifications.listPendingByRecipient(owner.identity, {
                limit: 10,
              })).map((note) => note.thread?.sequence),
            ).toEqual([3]);
          }),
        ),
      ),
  );
});
