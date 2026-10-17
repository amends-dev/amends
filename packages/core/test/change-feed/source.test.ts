import * as Entry from "@amends-dev/log/Entry"
import * as Log from "@amends-dev/log/Log"
import * as Store from "@amends-dev/log/Store"
import * as StoreError from "@amends-dev/log/StoreError"
import { expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import * as ChangeFeedChanges from "../../src/change-feed/ChangeFeedChanges.ts"
import * as ChangeFeedSource from "../../src/change-feed/ChangeFeedSource.ts"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Fact from "../../src/journal/Fact.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as Subject from "../../src/journal/Subject.ts"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"
import { make } from "../memory.ts"
import { testProvenance } from "../publication.ts"

const Noted = Fact.make("test.noted", {
  subject: () => Subject.make("test", "entity"),
  version: 1,
  payload: Schema.String
})

it.effect("a follower whose read fails follows on from its last commit, and nobody is cut off", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const journal = yield* Journal.make({
      logId: Entry.LogId.make("journal"),
      projections: []
    }).pipe(
      Effect.provide(
        Log.layer.pipe(
          Layer.provideMerge([
            Layer.succeed(Store.Store, fixture.store),
            Layer.succeed(WorkspaceId.CurrentWorkspaceId, fixture.workspaceId),
            Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints)
          ])
        )
      )
    )
    // The follower's first read delivers one commit and then loses its connection.
    let reads = 0
    const flaky = Journal.Journal.of(
      Object.assign({}, journal, {
        log: Object.assign({}, journal.log, {
          tail: (options: Parameters<typeof journal.log.tail>[0]) => {
            reads += 1
            return reads === 1
              ? journal.log
                  .tail(options)
                  .pipe(
                    Stream.take(1),
                    Stream.concat(Stream.fail(StoreError.failed("Store", "tail")("Lost connection")))
                  )
              : journal.log.tail(options)
          }
        })
      })
    )
    const note = (text: string) =>
      journal
        .commit(journal.publish(Noted, text))
        .pipe(Effect.provideService(Publication.Publication, testProvenance()))

    const source = yield* ChangeFeedSource.make().pipe(
      Effect.provideService(Journal.Journal, flaky),
      Effect.provideService(
        ChangeFeedChanges.ChangeFeedChanges,
        ChangeFeedChanges.ChangeFeedChanges.of({ changesOf: () => Effect.succeed([]) })
      )
    )
    const subscription = yield* source.subscribe(Option.none())
    const received = yield* Effect.forkChild(subscription.deliveries.pipe(Stream.take(2), Stream.runCollect))
    yield* TestClock.adjust("10 millis")
    yield* note("one")
    // The read fails after delivering it; the follower tries again after a backoff.
    yield* TestClock.adjust("1 second")
    yield* note("two")
    yield* TestClock.adjust("10 millis")
    const deliveries = yield* Fiber.join(received)
    const positions = deliveries.map((delivery) => delivery.position)
    expect(positions).toHaveLength(2)
    expect(new Set(positions).size).toBe(2)
    expect(reads).toBe(2)
  }).pipe(Effect.scoped)
)
