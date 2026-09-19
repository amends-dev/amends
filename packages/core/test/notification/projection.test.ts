import { expect, test } from "bun:test";
import { Effect, Option, Schema } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { NotificationProjection } from "../../src/notification/projection.ts";
import { make, type Fixture } from "../memory-store.ts";

const logId = Log.Id.make("journal");
const Source = Fact.make("notification-test.source", { version: 1, payload: Schema.String });
const key = {
  logId,
  name: NotificationProjection.definition.name,
  version: NotificationProjection.definition.version,
};
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, Log.Service | Transaction.Service | Checkpoint.Service>,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
    ),
  );

test("the empty notification projection catches up and checkpoints live batches without a notification store", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const source = yield* Journal.make({ logId, projections: [] });
      const historical = yield* source.publish(Source, "before registration");
      const journal = yield* Journal.make({
        logId,
        projections: [NotificationProjection.definition],
      });
      yield* journal.replay;
      expect(yield* fixture.checkpoints.get(key)).toEqual(
        Option.some({
          position: historical.position,
          commitId: historical.commitId,
          index: historical.index,
          entryId: historical.id,
        }),
      );
      const last = yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(Source, "first in batch");
          return yield* journal.publish(Source, "last in batch");
        }),
      );
      const expected = Option.some({
        position: last.position,
        commitId: last.commitId,
        index: last.index,
        entryId: last.id,
      });
      expect(yield* fixture.checkpoints.get(key)).toEqual(expected);
      yield* journal.replay;
      expect(yield* fixture.checkpoints.get(key)).toEqual(expected);
      const batches = yield* journal.log.read({ limit: 10 });
      expect(batches.map((batch) => batch.entries.length)).toEqual([1, 2]);
    }),
  );
});
