import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import { ChangeFeedSource } from "../../src/change-feed/source.ts";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Publication } from "../../src/journal/publication.ts";
import { Store } from "../../src/journal/store.ts";
import { Subject } from "../../src/journal/subject.ts";
import { make } from "../memory-store.ts";
import { testProvenance } from "../publication.ts";

const Noted = Fact.make("test.noted", {
  subject: () => Subject.make("test", "entity"),
  version: 1,
  payload: Schema.String,
});

it.effect(
  "a follower whose read fails follows on from its last commit, and nobody is cut off",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const journal = yield* Journal.make({ logId: Log.Id.make("journal"), projections: [] }).pipe(
        Effect.provide(
          Log.layer.pipe(
            Layer.provideMerge(
              Layer.mergeAll(
                Layer.succeed(Store.Service, fixture.store),
                Layer.succeed(Checkpoint.Service, fixture.checkpoints),
              ),
            ),
          ),
        ),
      );
      // The follower's first read delivers one commit and then loses its connection.
      let reads = 0;
      const flaky = Journal.Service.of(
        Object.assign({}, journal, {
          log: Object.assign({}, journal.log, {
            tail: (options: Parameters<typeof journal.log.tail>[0]) => {
              reads += 1;
              return reads === 1
                ? journal.log
                    .tail(options)
                    .pipe(
                      Stream.take(1),
                      Stream.concat(
                        Stream.fail(
                          new Store.Failure({ operation: "tail", cause: "Lost connection" }),
                        ),
                      ),
                    )
                : journal.log.tail(options);
            },
          }),
        }),
      );
      const note = (text: string) =>
        journal
          .commit(journal.publish(Noted, text))
          .pipe(Effect.provideService(Publication.Service, testProvenance()));

      const source = yield* ChangeFeedSource.make().pipe(
        Effect.provideService(Journal.Service, flaky),
      );
      const subscription = yield* source.subscribe(Option.none());
      const received = yield* Effect.forkChild(
        subscription.deliveries.pipe(Stream.take(2), Stream.runCollect),
      );
      yield* TestClock.adjust("10 millis");
      yield* note("one");
      // The read fails after delivering it; the follower tries again after a backoff.
      yield* TestClock.adjust("1 second");
      yield* note("two");
      yield* TestClock.adjust("10 millis");
      const deliveries = yield* Fiber.join(received);
      const positions = deliveries.map((delivery) => delivery.position);
      expect(positions).toHaveLength(2);
      expect(new Set(positions).size).toBe(2);
      expect(reads).toBe(2);
    }).pipe(Effect.scoped),
);
