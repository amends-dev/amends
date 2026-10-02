import { Notification, NotificationStore } from "@amends/core/notification";
import {
  Thread,
  ThreadActivity,
  ThreadActivityFacts,
  ThreadActivityKind,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadParticipation,
  ThreadParticipationActivity,
  ThreadParticipationFacts,
} from "@amends/core/thread";
import { Identity } from "@amends/core/identity";
import { Subject } from "@amends/core/journal";
import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { DateTime, Effect, Option, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Group } from "../../src/group/group.ts";
import { GroupMembership } from "../../src/group/membership/membership.ts";
import { GroupMembershipFacts } from "../../src/group/membership/facts.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { NotificationProjection } from "../../src/notification/projection.ts";
import { make, type Fixture } from "../memory-store.ts";

const testSubject = () => Subject.make("test", "entity");
const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Log.Id.make("journal");
const Source = Fact.make("notification-test.source", {
  subject: testSubject,
  version: 1,
  payload: Schema.String,
});
const key = {
  logId,
  name: NotificationProjection.definition.name,
  version: NotificationProjection.definition.version,
};
/** A notification store that refuses every call; tests replace the calls they expect. */
const refusing: NotificationStore.Interface = {
  get: () => Effect.die("Unexpected notification read"),
  listByRecipient: () => Effect.die("Unexpected notification read"),
  listPendingByRecipient: () => Effect.die("Unexpected notification read"),
  listLatestByRecipient: () => Effect.die("Unexpected notification read"),
  listLatestPendingByRecipient: () => Effect.die("Unexpected notification read"),
  listPendingByThread: () => Effect.die("Unexpected notification read"),
  countPendingByRecipient: () => Effect.die("Unexpected notification read"),
  countPendingByGroup: () => Effect.die("Unexpected notification read"),
  insert: () => Effect.die("Unexpected notification write"),
  insertMany: () => Effect.die("Unexpected notification write"),
  discardPendingForParticipation: () => Effect.die("Unexpected notification write"),
  discardPendingForGroup: () => Effect.die("Unexpected notification write"),
  markSeen: () => Effect.die("Unexpected notification write"),
  accept: () => Effect.die("Unexpected notification write"),
};
/** Only the notification store is provided, so the projection can read no other read model. */
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    | Publication.Service
    | Log.Service
    | Transaction.Service
    | Checkpoint.Service
    | NotificationStore.Service
  >,
  notifications = refusing,
) =>
  program.pipe(
    Effect.provideService(NotificationStore.Service, notifications),
    Effect.provideService(Publication.Service, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Service, fixture.store),
    Effect.provideService(Checkpoint.Service, fixture.checkpoints),
  );
it.effect(
  "facts without a notification handler rebuild and publish without reading or writing domain stores",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      yield* run(
        fixture,
        Effect.gen(function* () {
          const source = yield* Journal.make({ logId, projections: [] });
          const historical = yield* source.publish(Source, "before registration");
          const journal = yield* Journal.make({
            logId,
            projections: [NotificationProjection.definition],
          });
          yield* journal.replay;
          const rebuilt = Option.some({
            position: historical.position,
            commitId: historical.commitId,
            index: historical.index,
            entryId: historical.id,
          });
          expect(yield* fixture.checkpoints.get(key)).toEqual(rebuilt);
          expect(yield* fixture.checkpoints.listLive(logId)).toEqual([
            { name: key.name, version: key.version },
          ]);
          yield* journal.commit(
            Effect.gen(function* () {
              yield* journal.publish(Source, "first in batch");
              return yield* journal.publish(Source, "last in batch");
            }),
          );
          // Live commits record no progress, and a live projection is not rebuilt again.
          expect(yield* fixture.checkpoints.get(key)).toEqual(rebuilt);
          yield* journal.replay;
          expect(yield* fixture.checkpoints.get(key)).toEqual(rebuilt);
          const batches = yield* journal.log.read({ limit: 10 });
          expect(batches.map((batch) => batch.entries.length)).toEqual([1, 2]);
        }),
      );
    }),
);

it.effect("participation domain facts publish without touching notifications", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    yield* run(
      fixture,
      Effect.gen(function* () {
        const journal = yield* Journal.make({
          logId,
          projections: [NotificationProjection.definition],
        });
        // The fixture defects on every notification read or write.
        yield* journal.publish(ThreadParticipationFacts.Ended, {
          workspaceId,
          groupId: Group.Id.make("group"),
          threadId: Thread.Id.make("thread"),
          participationId: ThreadParticipation.Id.make("participation"),
          memberId: Member.Id.make("member"),
          reason: "unfollowed",
        });
        expect(yield* fixture.checkpoints.get(key)).toEqual(Option.none());
        yield* journal.replay;
      }),
    );
  }),
);

it.effect("notifications rebuild from recorded activity alone", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const inserted: Array<Notification.Record> = [];
    const discarded: Array<ThreadParticipation.Id> = [];
    const notifications: NotificationStore.Interface = {
      ...refusing,
      insertMany: (records) => Effect.sync(() => void inserted.push(...records)),
      discardPendingForParticipation: (id) => Effect.sync(() => void discarded.push(id)),
    };
    const groupId = Group.Id.make("group");
    const threadId = Thread.Id.make("thread");
    const occurredAt = DateTime.makeUnsafe("2026-09-20T12:00:00.000Z");
    const agent = ThreadParticipation.Id.make("agent-participation");
    const recipients = [
      {
        participationId: ThreadParticipation.Id.make("human-participation"),
        recipient: {
          _tag: "Human" as const,
          id: Identity.HumanId.make("human"),
          memberId: Member.Id.make("human-member"),
        },
        requestsWork: false,
      },
      {
        participationId: agent,
        recipient: {
          _tag: "Agent" as const,
          id: Identity.AgentId.make("agent"),
          memberId: Member.Id.make("agent-member"),
        },
        requestsWork: true,
      },
    ];
    const published = ThreadActivityKind.makeRecordUnsafe(
      ThreadMessageActivity.Published,
      { id: ThreadActivity.Id.make("published"), workspaceId, threadId, sequence: 1, occurredAt },
      { messageId: ThreadMessage.Id.make("message") },
    );
    yield* run(
      fixture,
      Effect.gen(function* () {
        // History recorded before the projection existed, as a rebuild finds it.
        const source = yield* Journal.make({ logId, projections: [] });
        const message = yield* source.publish(ThreadActivityFacts.Recorded, {
          groupId,
          activity: published,
          recipients,
        });
        yield* source.publish(ThreadActivityFacts.Recorded, {
          groupId,
          activity: ThreadActivityKind.makeRecordUnsafe(
            ThreadParticipationActivity.Ended,
            { id: ThreadActivity.Id.make("ended"), workspaceId, threadId, sequence: 2, occurredAt },
            { participationId: agent, reason: "unfollowed" },
          ),
          recipients: [],
        });
        const journal = yield* Journal.make({
          logId,
          projections: [NotificationProjection.definition],
        });
        yield* journal.replay;
        expect(inserted).toEqual(
          recipients.map((recipient) =>
            Notification.fromActivity(message, Object.assign({ groupId }, published), recipient),
          ),
        );
        // The store decides from its own records which of the participation's notifications settle.
        expect(discarded).toEqual([agent]);
      }),
      notifications,
    );
  }),
);

it.effect("leaving a group settles what the member had pending from it, live and on rebuild", () =>
  Effect.gen(function* () {
    const departure = (reason: "left" | "removed" | "workspace-removed", group: string) => ({
      workspaceId,
      groupId: Group.Id.make(group),
      membershipId: GroupMembership.Id.make(`${group}-admission`),
      memberId: Member.Id.make("human-member"),
      reason,
    });
    // Leaving, removal, and workspace removal all end access, so each settles.
    const departures = [
      departure("left", "design"),
      departure("removed", "ops"),
      departure("workspace-removed", "lobby"),
    ];
    const expected = departures.map((value) => [value.memberId, value.groupId]);
    for (const rebuild of [false, true]) {
      const fixture = yield* make();
      const settled: Array<readonly [Member.Id, Group.Id]> = [];
      const notifications: NotificationStore.Interface = {
        ...refusing,
        discardPendingForGroup: (memberId, groupId) =>
          Effect.sync(() => void settled.push([memberId, groupId])),
      };
      yield* run(
        fixture,
        Effect.gen(function* () {
          // A rebuild finds the departures recorded before the projection ran.
          const recorder = rebuild
            ? yield* Journal.make({ logId, projections: [] })
            : yield* Journal.make({ logId, projections: [NotificationProjection.definition] });
          for (const value of departures)
            yield* recorder.publish(GroupMembershipFacts.Removed, value);
          if (rebuild)
            yield* (yield* Journal.make({
              logId,
              projections: [NotificationProjection.definition],
            })).replay;
          expect(settled).toEqual(expected);
        }),
        notifications,
      );
    }
  }),
);
