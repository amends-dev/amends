import { Notification, NotificationFacts } from "@amends/core/notification";
import {
  Thread,
  ThreadFacts,
  ThreadMessage,
  ThreadMessageFacts,
  ThreadParticipation,
  ThreadParticipationFacts,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadPermissions,
} from "@amends/core/thread";
import { Subject } from "@amends/core/journal";
import {
  Group,
  GroupFacts,
  GroupFollow,
  GroupFollowFacts,
  GroupMembership,
  GroupMembershipFacts,
  GroupMembershipStore,
  GroupPermissions,
} from "@amends/core/group";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Exit, Fiber, Layer, Option, Queue, Schema, Scope, Stream } from "effect";
import { Assignment } from "../../src/authorization/assignment/assignment.ts";
import { AssignmentStore } from "../../src/authorization/assignment/store.ts";
import { Authorization } from "../../src/authorization/authorization.ts";
import { GrantResolver } from "../../src/authorization/grant-resolver.ts";
import { PermissionCatalog } from "../../src/authorization/permission-catalog.ts";
import type { Permission } from "../../src/authorization/permission.ts";
import { RoleStore } from "../../src/authorization/role/store.ts";
import { Scope as GrantScope } from "../../src/authorization/scope.ts";
import { ChangeFeedApplication } from "../../src/change-feed/application.ts";
import { ChangeFeed } from "../../src/change-feed/change-feed.ts";
import { ChangeFeedSource } from "../../src/change-feed/source.ts";
import { Actor } from "../../src/identity/actor.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Invitation } from "../../src/workspace/invitation/invitation.ts";
import { InvitationFacts } from "../../src/workspace/invitation/facts.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberFacts } from "../../src/workspace/member/facts.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Workspace } from "../../src/workspace/workspace.ts";
import { Role } from "../../src/authorization/role/role.ts";
import { make, type Fixture } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const workspaceId = Workspace.Id.make("workspace-one");
const at = DateTime.makeUnsafe("2026-09-20T12:00:00.123Z");
const alice: Identity.MemberReference = { _tag: "Human", id: Identity.HumanId.make("alice") };
const actor = Actor.Value.make({
  workspaceId,
  memberId: Member.Id.make("alice-member"),
  identity: alice,
});
const bobMember = Member.Id.make("bob-member");
const groupId = Group.Id.make("group");
const otherGroupId = Group.Id.make("other-group");
const threadId = Thread.Id.make("thread");
const otherThreadId = Thread.Id.make("other-thread");

const invitation = (id: string): Invitation.Issuance => ({
  id: Invitation.Id.make(id),
  workspaceId,
  inviterMemberId: actor.memberId,
  recipientId: Identity.HumanId.make("bob"),
  roleId: Role.Id.make("viewer"),
  issuedAt: at,
  expiresAt: DateTime.makeUnsafe("2026-09-21T12:00:00.456Z"),
});
const group = (id: Group.Id) => ({
  id,
  workspaceId,
  kind: "Team" as const,
  visibility: "Private" as const,
  name: "Private name",
  createdBy: actor.memberId,
  createdAt: at,
});
const admission = (group: Group.Id, memberId = actor.memberId) => ({
  id: GroupMembership.Id.make(`${group}:${memberId}`),
  workspaceId,
  groupId: group,
  memberId,
  admittedAt: at,
  status: "active" as const,
});
const thread = (id: Thread.Id, group: Group.Id) => ({
  id,
  workspaceId,
  groupId: group,
  createdBy: { _tag: "Member" as const, memberId: bobMember },
  createdAt: at,
});
const message = (id: string, thread: Thread.Id, group: Group.Id) => ({
  id: ThreadMessage.Id.make(id),
  workspaceId,
  groupId: group,
  threadId: thread,
  author: { _tag: "Member" as const, memberId: bobMember },
  kind: "User" as const,
  text: `Message ${id}`,
  mentions: [],
  publishedAt: at,
});
const workspaceGrant = (permission: Permission.Definition) =>
  Assignment.Source.cases.Direct.make({
    grant: {
      permission: permission.name,
      scope: GrantScope.Value.cases.Workspace.make({ workspaceId }),
    },
  });
const threadGrant = (id: Thread.Id) =>
  Assignment.Source.cases.Direct.make({
    grant: {
      permission: ThreadPermissions.Read.name,
      scope: GrantScope.Value.cases.Target.make({
        target: { _tag: "Thread", workspaceId, threadId: id },
      }),
    },
  });
const Internal = Fact.make("test.internal", {
  version: 1,
  payload: Schema.String,
  subject: () => Subject.make("test", "entity"),
});

interface Options {
  readonly source?: ChangeFeedSource.Options;
  /** The actor's grants; by default thread and group reads across the workspace. */
  readonly grants?: ReadonlyArray<Assignment.Source>;
}
interface World {
  readonly fixture: Fixture;
  /** The groups the actor currently belongs to, as the membership projection would report. */
  readonly admitted: Set<Group.Id>;
}
type Services = ChangeFeedApplication.Service | Journal.Service | Actor.Service | Scope.Scope;

const run = <A, E>(use: (world: World) => Effect.Effect<A, E, Services>, options: Options = {}) =>
  Effect.gen(function* () {
    const fixture = yield* make(workspaceId);
    const grants = options.grants ?? [
      workspaceGrant(ThreadPermissions.Read),
      workspaceGrant(GroupPermissions.Read),
    ];
    yield* fixture.store.transaction(
      Effect.gen(function* () {
        yield* fixture.members(workspaceId).insert({
          id: actor.memberId,
          workspaceId,
          identity: actor.identity,
          status: "active",
        });
        for (const [index, source] of grants.entries())
          yield* fixture.assignments(workspaceId).insert({
            id: Assignment.Id.make(`grant-${index}`),
            workspaceId,
            memberId: actor.memberId,
            source,
            status: "active",
          });
      }),
    );
    const admitted = new Set<Group.Id>();
    const unexpected = () => Effect.die(new Error("Unexpected membership store use"));
    const memberships = GroupMembershipStore.Service.of({
      workspaceId,
      get: unexpected,
      getMany: unexpected,
      findActive: unexpected,
      listByGroup: unexpected,
      pageActiveByGroup: unexpected,
      pageActiveByMember: unexpected,
      listActiveByMember: (memberId) =>
        Effect.succeed(memberId === actor.memberId ? [...admitted].map((id) => admission(id)) : []),
      insert: unexpected,
      markRemoved: unexpected,
    });
    const host = Layer.mergeAll(
      Layer.succeed(Store.Service, fixture.store),
      Layer.succeed(Checkpoint.Service, fixture.checkpoints),
      Layer.succeed(MemberStore.Service, fixture.members(workspaceId)),
      Layer.succeed(RoleStore.Service, fixture.roles(workspaceId)),
      Layer.succeed(AssignmentStore.Service, fixture.assignments(workspaceId)),
      Layer.succeed(GroupMembershipStore.Service, memberships),
      PermissionCatalog.layer([ThreadPermissions.Read, GroupPermissions.Read]),
    );
    const services = Layer.mergeAll(
      Journal.layer({ logId: Log.Id.make("journal"), projections: [] }).pipe(
        Layer.provide(Log.layer),
      ),
      Authorization.layer.pipe(Layer.provide(GrantResolver.layer)),
      GrantResolver.layer,
    ).pipe(Layer.provideMerge(host));
    const configured = ChangeFeedApplication.layer.pipe(
      Layer.provide(ChangeFeedSource.layer(options.source)),
      Layer.provideMerge(services),
    );
    return yield* use({ fixture, admitted }).pipe(
      Effect.provide(configured),
      Effect.provideService(Actor.Service, actor),
    );
  }).pipe(Effect.scoped);

/** Publish facts in one commit with trusted test attribution. */
const commit = (program: Effect.Effect<unknown, unknown, Journal.Service | Publication.Service>) =>
  Effect.flatMap(Journal.Service, (journal) =>
    journal
      .commit(program)
      .pipe(
        Effect.provideService(Publication.Service, testProvenance(workspaceId)),
        Effect.provideService(Journal.Service, journal),
      ),
  ).pipe(Effect.orDie);
const publish = <F extends Fact.Definition>(fact: F, payload: Fact.Payload<NoInfer<F>>) =>
  Effect.flatMap(Journal.Service, (journal) => journal.publish(fact, payload));

/** Open a subscription and buffer its messages; the stream's end shows in its fiber. */
const listen = Effect.fnUntraced(function* (options?: ChangeFeed.WatchOptions) {
  const stream = yield* (yield* ChangeFeedApplication.Service).watch(options);
  const queue = yield* Queue.unbounded<ChangeFeed.Message>();
  const fiber = yield* stream.pipe(
    Stream.runForEach((message) => Queue.offer(queue, message)),
    Effect.forkScoped,
  );
  return { next: Queue.take(queue), fiber, queue };
});
const committed = (message: ChangeFeed.Message) => {
  if (message._tag !== "Committed") throw new Error(`Expected a commit, got ${message._tag}`);
  return message;
};

it.effect("a subscription without a cursor resets at the head, then delivers later commits", () =>
  run(() =>
    Effect.gen(function* () {
      yield* commit(publish(InvitationFacts.Issued, invitation("before")));
      const feed = yield* listen();
      const ready = yield* feed.next;
      expect(ready).toEqual({ _tag: "Ready", workspaceId, cursor: "0", reset: true });
      yield* commit(publish(InvitationFacts.Issued, invitation("after")));
      const received = committed(yield* feed.next);
      expect(received.cursor).toBe("1");
      expect(received.events.map((event) => event.name)).toEqual([InvitationFacts.Issued.name]);
      expect(received.events[0]?.payload).toMatchObject({
        id: "after",
        issuedAt: "2026-09-20T12:00:00.123Z",
      });
      expect(yield* Queue.size(feed.queue)).toBe(0);
    }),
  ),
);

it.effect("an empty journal reports no cursor, and the first commit carries one", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen();
      expect(yield* feed.next).toEqual({ _tag: "Ready", workspaceId, cursor: null, reset: true });
      yield* commit(publish(InvitationFacts.Issued, invitation("first")));
      expect(committed(yield* feed.next).cursor).toBe("0");
    }),
  ),
);

it.effect("a cursor resumes after its commit without a reset, replaying what followed", () =>
  run(() =>
    Effect.gen(function* () {
      const cursor = yield* Effect.scoped(
        Effect.gen(function* () {
          const feed = yield* listen();
          yield* feed.next;
          yield* commit(publish(InvitationFacts.Issued, invitation("seen")));
          return committed(yield* feed.next).cursor;
        }),
      );
      yield* commit(publish(InvitationFacts.Issued, invitation("missed-1")));
      yield* commit(publish(Internal, "not delivered"));
      yield* commit(publish(InvitationFacts.Issued, invitation("missed-2")));
      const feed = yield* listen({ after: cursor });
      expect(yield* feed.next).toEqual({ _tag: "Ready", workspaceId, cursor, reset: false });
      const replayed = [committed(yield* feed.next), committed(yield* feed.next)];
      expect(replayed.map((m) => m.events[0]?.payload)).toMatchObject([
        { id: "missed-1" },
        { id: "missed-2" },
      ]);
      expect(replayed.map((m) => m.cursor)).toEqual(["1", "3"]);
      yield* commit(publish(InvitationFacts.Issued, invitation("live")));
      expect(committed(yield* feed.next).events[0]?.payload).toMatchObject({ id: "live" });
      // Resuming at the head replays nothing and still needs no reset.
      const current = yield* listen({ after: ChangeFeed.Cursor.make("4") });
      expect(yield* current.next).toMatchObject({ reset: false, cursor: "4" });
    }),
  ),
);

it.effect("a cursor past the head, or further behind than the replay limit, resets", () =>
  run(
    () =>
      Effect.gen(function* () {
        for (const id of ["a", "b", "c", "d"])
          yield* commit(publish(InvitationFacts.Issued, invitation(id)));
        const unknown = yield* listen({ after: ChangeFeed.Cursor.make("99") });
        expect(yield* unknown.next).toEqual({
          _tag: "Ready",
          workspaceId,
          cursor: "3",
          reset: true,
        });
        const behind = yield* listen({ after: ChangeFeed.Cursor.make("0") });
        expect(yield* behind.next).toMatchObject({ cursor: "3", reset: true });
        const within = yield* listen({ after: ChangeFeed.Cursor.make("1") });
        expect(yield* within.next).toMatchObject({ cursor: "1", reset: false });
        expect(committed(yield* within.next).cursor).toBe("2");
        expect(committed(yield* within.next).cursor).toBe("3");
        yield* commit(publish(InvitationFacts.Issued, invitation("e")));
        for (const feed of [unknown, behind, within])
          expect(committed(yield* feed.next).cursor).toBe("4");
      }),
    { source: { capacity: 256, replayLimit: 2, pageSize: 1 } },
  ),
);

it.effect("invalid cursors are rejected before subscribing", () =>
  run(() =>
    Effect.gen(function* () {
      const application = yield* ChangeFeedApplication.Service;
      for (const after of ["-1", "01", "1.5", "x", "9007199254740993"]) {
        const error = yield* Effect.flip(application.watch({ after: after as ChangeFeed.Cursor }));
        expect(Schema.isSchemaError(error)).toBe(true);
      }
    }),
  ),
);

it.effect(
  "group and thread events reach the group's readers, and admission reloads the reader's scopes",
  () =>
    run(({ admitted }) =>
      Effect.gen(function* () {
        const feed = yield* listen();
        yield* feed.next;
        // Not yet a member: the group's thread and messages are withheld.
        yield* commit(
          Effect.gen(function* () {
            yield* publish(GroupFacts.Created, group(groupId));
            yield* publish(ThreadFacts.Created, thread(threadId, groupId));
            yield* publish(ThreadMessageFacts.Published, message("hidden", threadId, groupId));
          }),
        );
        // The projection admits the reader in the same commit that records the admission.
        admitted.add(groupId);
        yield* commit(
          Effect.gen(function* () {
            yield* publish(GroupMembershipFacts.Added, admission(groupId));
            yield* publish(ThreadMessageFacts.Published, message("visible", threadId, groupId));
          }),
        );
        const joined = committed(yield* feed.next);
        expect(joined.cursor).toBe("1");
        expect(joined.events.map((e) => e.name)).toEqual([
          GroupMembershipFacts.Added.name,
          ThreadMessageFacts.Published.name,
        ]);
        // Another group's activity stays withheld.
        yield* commit(
          publish(ThreadMessageFacts.Published, message("elsewhere", otherThreadId, otherGroupId)),
        );
        admitted.delete(groupId);
        yield* commit(
          Effect.gen(function* () {
            yield* publish(GroupMembershipFacts.Removed, {
              groupId,
              membershipId: admission(groupId).id,
              workspaceId,
              memberId: actor.memberId,
              reason: "removed",
            });
            yield* publish(ThreadMessageFacts.Published, message("after", threadId, groupId));
          }),
        );
        // The removed reader learns of their removal, and nothing after it.
        const left = committed(yield* feed.next);
        expect(left.cursor).toBe("3");
        expect(left.events.map((e) => e.name)).toEqual([GroupMembershipFacts.Removed.name]);
        yield* commit(publish(InvitationFacts.Issued, invitation("marker")));
        expect(committed(yield* feed.next).events[0]?.name).toBe(InvitationFacts.Issued.name);
      }),
    ),
);

it.effect("thread events also need the reader's thread.read grant for that thread", () =>
  run(
    ({ admitted }) =>
      Effect.gen(function* () {
        admitted.add(groupId);
        const feed = yield* listen();
        yield* feed.next;
        yield* commit(
          Effect.gen(function* () {
            yield* publish(ThreadMessageFacts.Published, message("granted", threadId, groupId));
            yield* publish(
              ThreadMessageFacts.Published,
              message("ungranted", otherThreadId, groupId),
            );
          }),
        );
        const received = committed(yield* feed.next);
        expect(received.events.map((e) => e.payload)).toMatchObject([{ id: "granted" }]);
      }),
    { grants: [threadGrant(threadId)] },
  ),
);

it.effect(
  "personal facts reach only their owner, and thread views hide recipients and routing",
  () =>
    run(({ admitted }) =>
      Effect.gen(function* () {
        admitted.add(groupId);
        const feed = yield* listen();
        yield* feed.next;
        const follow = (memberId: Member.Id) => ({
          id: GroupFollow.Id.make(`follow-${memberId}`),
          workspaceId,
          groupId,
          memberId,
          groupMembershipId: admission(groupId, memberId).id,
          followedAt: at,
          status: "active" as const,
          endedAt: null,
        });
        const acknowledged = (recipient: Identity.MemberReference, id: string) => ({
          workspaceId,
          notificationId: Notification.Id.make(id),
          recipient,
          acknowledgment: { outcome: { _tag: "Seen" as const }, acknowledgedAt: at },
        });
        const bob: Identity.MemberReference = { _tag: "Human", id: Identity.HumanId.make("bob") };
        yield* commit(
          Effect.gen(function* () {
            yield* publish(GroupFollowFacts.Started, follow(bobMember));
            yield* publish(GroupFollowFacts.Started, follow(actor.memberId));
            yield* publish(NotificationFacts.Acknowledged, acknowledged(bob, "bobs"));
            yield* publish(NotificationFacts.Acknowledged, acknowledged(alice, "alices"));
            yield* publish(ThreadParticipationFacts.Added, {
              id: ThreadParticipation.Id.make("participation"),
              workspaceId,
              groupId,
              threadId,
              participant: {
                _tag: "Member",
                memberId: bobMember,
                groupMembershipId: admission(groupId, bobMember).id,
                identity: bob,
              },
              joinedAt: at,
              joinedAtSequence: 1,
              status: "active",
              endedAt: null,
            });
            yield* publish(ThreadActivityFacts.Recorded, {
              groupId,
              activity: {
                id: ThreadActivity.Id.make("activity"),
                workspaceId,
                threadId,
                sequence: 1,
                kind: "MessagePublished",
                messageId: ThreadMessage.Id.make("message"),
                occurredAt: at,
              },
              recipients: [
                {
                  participationId: ThreadParticipation.Id.make("participation"),
                  recipient: bob,
                },
              ],
            });
          }),
        );
        const received = committed(yield* feed.next);
        expect(received.events.map((e) => [e.name, e.payload])).toEqual([
          [GroupFollowFacts.Started.name, expect.objectContaining({ memberId: actor.memberId })],
          [
            NotificationFacts.Acknowledged.name,
            expect.objectContaining({ notificationId: "alices" }),
          ],
          [
            ThreadParticipationFacts.Added.name,
            {
              id: "participation",
              workspaceId,
              groupId,
              threadId,
              participant: { _tag: "Member", memberId: bobMember },
              joinedAt: "2026-09-20T12:00:00.123Z",
              joinedAtSequence: 1,
            },
          ],
          [
            ThreadActivityFacts.Recorded.name,
            {
              groupId,
              activity: {
                id: "activity",
                workspaceId,
                threadId,
                sequence: 1,
                kind: "MessagePublished",
                messageId: "message",
                occurredAt: "2026-09-20T12:00:00.123Z",
              },
            },
          ],
        ]);
      }),
    ),
);

/** Activity in the group that selects Alice and Bob as recipients. */
const notifying = publish(ThreadActivityFacts.Recorded, {
  groupId,
  activity: {
    id: ThreadActivity.Id.make("reply-activity"),
    workspaceId,
    threadId,
    sequence: 3,
    kind: "MessagePublished",
    messageId: ThreadMessage.Id.make("reply"),
    occurredAt: at,
  },
  recipients: [
    { participationId: ThreadParticipation.Id.make("alice-participation"), recipient: alice },
    {
      participationId: ThreadParticipation.Id.make("bob-participation"),
      recipient: { _tag: "Human", id: Identity.HumanId.make("bob") },
    },
    { participationId: ThreadParticipation.Id.make("triage"), recipient: { _tag: "Triage" } },
  ],
});

it.effect("the notifications a commit creates reach their recipient alone, with the activity", () =>
  run(({ admitted }) =>
    Effect.gen(function* () {
      admitted.add(groupId);
      const feed = yield* listen();
      yield* feed.next;
      yield* commit(notifying);
      const received = committed(yield* feed.next);
      const [activity] = received.events;
      expect(activity?.name).toBe(ThreadActivityFacts.Recorded.name);
      expect(received.notifications).toEqual([
        {
          id: JSON.stringify(["journal", activity?.id, "alice-participation"]),
          workspaceId,
          source: { logId: "journal", entryId: activity?.id },
          participationId: "alice-participation",
          thread: { threadId, sequence: 3 },
          recipient: alice,
          recordedAt: activity?.recordedAt,
          state: { _tag: "Pending" },
        },
      ]);
    }),
  ),
);

it.effect("a recipient without read access still receives their notification alone", () =>
  run(
    () =>
      Effect.gen(function* () {
        const feed = yield* listen();
        yield* feed.next;
        yield* commit(notifying);
        const received = committed(yield* feed.next);
        expect(received.events).toEqual([]);
        expect(received.notifications.map((n) => n.participationId)).toEqual([
          "alice-participation",
        ]);
      }),
    { grants: [] },
  ),
);

it.effect("internal facts are skipped, and a commit of only internal facts sends nothing", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen();
      yield* feed.next;
      yield* commit(publish(Internal, "private"));
      yield* commit(
        Effect.gen(function* () {
          yield* publish(Internal, "private");
          yield* publish(InvitationFacts.Issued, invitation("public"));
        }),
      );
      const received = committed(yield* feed.next);
      expect(received.cursor).toBe("1");
      expect(received.events.map((e) => e.name)).toEqual([InvitationFacts.Issued.name]);
    }),
  ),
);

it.effect("the reader's removal from the workspace is delivered, then the stream ends", () =>
  run(() =>
    Effect.gen(function* () {
      const feed = yield* listen();
      yield* feed.next;
      yield* commit(
        publish(MemberFacts.Removed, { workspaceId, memberId: Member.Id.make("someone-else") }),
      );
      expect(committed(yield* feed.next).events[0]?.name).toBe(MemberFacts.Removed.name);
      yield* commit(publish(MemberFacts.Removed, { workspaceId, memberId: actor.memberId }));
      expect(committed(yield* feed.next).events[0]?.payload).toEqual({
        workspaceId,
        memberId: actor.memberId,
      });
      const exit = yield* Fiber.await(feed.fiber);
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new ChangeFeed.Unavailable({})),
      );
    }),
  ),
);

it.effect("a slow subscriber catches up from the journal instead of losing commits", () =>
  run(
    () =>
      Effect.gen(function* () {
        const application = yield* ChangeFeedApplication.Service;
        const slow = yield* application.watch();
        const fast = yield* listen();
        yield* fast.next;
        for (const id of ["a", "b", "c", "d", "e"])
          yield* commit(publish(InvitationFacts.Issued, invitation(id)));
        // Once the fast subscriber has everything, the follower has published it all.
        for (let index = 0; index < 5; index += 1) yield* fast.next;
        const queue = yield* Queue.unbounded<ChangeFeed.Message>();
        yield* slow.pipe(
          Stream.runForEach((message) => Queue.offer(queue, message)),
          Effect.forkScoped,
        );
        expect(yield* Queue.take(queue)).toMatchObject({ _tag: "Ready", cursor: null });
        const cursors: Array<string> = [];
        for (let index = 0; index < 5; index += 1)
          cursors.push(committed(yield* Queue.take(queue)).cursor);
        expect(cursors).toEqual(["0", "1", "2", "3", "4"]);
        // After catching up, the next delivery is the next commit, not a repeat.
        yield* commit(publish(InvitationFacts.Issued, invitation("f")));
        expect(committed(yield* Queue.take(queue)).cursor).toBe("5");
      }),
    { source: { capacity: 1, replayLimit: 500, pageSize: 2 } },
  ),
);

it.effect(
  "an unknown version of a delivered fact stops the feed; a new subscription recovers",
  () =>
    run(() =>
      Effect.gen(function* () {
        const Future = Fact.make(MemberFacts.Added.name, {
          version: 99,
          payload: Schema.String,
          subject: () => Subject.make("member", "future"),
        });
        const feed = yield* listen();
        yield* feed.next;
        yield* commit(publish(Future, "unknown to this host"));
        const exit = yield* Fiber.await(feed.fiber);
        expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
          Option.some(new ChangeFeed.Unavailable({})),
        );
        const next = yield* listen();
        expect(yield* next.next).toMatchObject({ _tag: "Ready", cursor: "0", reset: true });
        yield* commit(publish(InvitationFacts.Issued, invitation("recovered")));
        expect(committed(yield* next.next).cursor).toBe("1");
      }),
    ),
);

it.effect("a removed member cannot subscribe", () =>
  run(({ fixture }) =>
    Effect.gen(function* () {
      yield* fixture.store.transaction(fixture.members(workspaceId).markRemoved(actor.memberId));
      const error = yield* Effect.flip((yield* ChangeFeedApplication.Service).watch());
      expect(error).toMatchObject({ _tag: "Authorization.InvalidActor" });
    }),
  ),
);
