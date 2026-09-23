import { NotificationStore } from "@amends/core/notification";
import {
  Thread,
  ThreadParticipation,
  ThreadParticipationFacts,
  ThreadParticipationStore,
} from "@amends/core/thread";
import { Subject } from "@amends/core/journal";
import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Group } from "../../src/group/group.ts";
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
    | ThreadParticipationStore.Service
  >,
) =>
  program.pipe(
    Effect.provideService(NotificationStore.Service, {
      workspaceId,
      get: () => Effect.die("Unexpected notification read"),
      listByRecipient: () => Effect.die("Unexpected notification read"),
      listPendingByRecipient: () => Effect.die("Unexpected notification read"),
      listPendingByThread: () => Effect.die("Unexpected notification read"),
      insert: () => Effect.die("Unexpected notification write"),
      insertMany: () => Effect.die("Unexpected notification write"),
      discardPendingForParticipation: () => Effect.die("Unexpected notification write"),
      acknowledge: () => Effect.die("Unexpected notification write"),
    }),
    Effect.provideService(ThreadParticipationStore.Service, {
      workspaceId,
      get: () => Effect.die("Unexpected participation read"),
      getMany: () => Effect.die("Unexpected participation read"),
      listByThread: () => Effect.die("Unexpected participation read"),
      listByAdmission: () => Effect.die("Unexpected participation read"),
      insert: () => Effect.die("Unexpected participation write"),
      end: () => Effect.die("Unexpected participation write"),
    }),
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
        // The fixture defects on every participation or notification read/write.
        yield* journal.publish(ThreadParticipationFacts.Ended, {
          workspaceId,
          groupId: Group.Id.make("group"),
          threadId: Thread.Id.make("thread"),
          participationId: ThreadParticipation.Id.make("participation"),
          reason: "unfollowed",
        });
        expect(yield* fixture.checkpoints.get(key)).toEqual(Option.none());
        yield* journal.replay;
      }),
    );
  }),
);
