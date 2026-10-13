import { Subject } from "@amends-dev/core/journal"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { Cause, Context, Effect, Exit, Layer, Option, Ref, Schema } from "effect"
import * as Checkpoint from "../../src/journal/Checkpoint.ts"
import * as Entry from "../../src/journal/Entry.ts"
import * as Fact from "../../src/journal/Fact.ts"
import * as Journal from "../../src/journal/Journal.ts"
import * as Log from "../../src/journal/Log.ts"
import * as Projection from "../../src/journal/Projection.ts"
import * as Publication from "../../src/journal/Publication.ts"
import * as Store from "../../src/journal/Store.ts"
import * as Transaction from "../../src/journal/Transaction.ts"
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts"
import { Counter, make } from "../memory.ts"
import { testProvenance } from "../publication.ts"

const testSubject = () => Subject.make("test", "entity")
const workspaceId = WorkspaceId.Id.make("workspace-one")
const Changed = Fact.make("counter.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.Finite
})
const counter = Projection.make("counter", { version: 1 }).on(
  Changed,
  Effect.fn("ServiceTest.count")(function* (event) {
    yield* (yield* Counter).add(event.payload)
  })
)
class Rejected extends Schema.TaggedError<Rejected>()("ServiceTest.Rejected", {
  reason: Schema.String
}) {}
class Audit extends Context.Service<
  Audit,
  {
    readonly check: Effect.Effect<void, Rejected>
  }
>()("ServiceTest/Audit") {}
it.effect.each(["make", "layer"] as const)(
  "journal %s binds heterogeneous projections behind one stable service",
  (construction) =>
    Effect.gen(function* () {
      const fixture = yield* make()
      const reject = yield* Ref.make(false)
      const finalized = yield* Ref.make(0)
      const rejection = new Rejected({ reason: "test rejection" })
      const audit = Projection.make("audit", { version: 1 }).on(
        Changed,
        Effect.fn("ServiceTest.audit")(function* (event) {
          yield* (yield* Audit).check
          const storeTransaction = yield* Store.Transaction
          expect(storeTransaction.id).toBe(event.commitId)
          yield* Effect.addFinalizer(() => Ref.update(finalized, (count) => count + 1))
        })
      )
      const configured = Journal.layer({
        logId: Entry.LogId.make("domain"),
        projections: [counter, audit]
      })
      const registrations = [counter, audit]
      const fromArray = Journal.layer({
        logId: Entry.LogId.make("domain"),
        projections: registrations
      })
      expectTypeOf<Layer.Services<typeof fromArray>>().toEqualTypeOf<Layer.Services<typeof configured>>()
      expectTypeOf<Layer.Success<typeof configured>>().toEqualTypeOf<Journal.Journal>()
      expectTypeOf<Layer.Services<typeof configured>>().toEqualTypeOf<
        Log.Log | Transaction.Transaction | Checkpoint.Checkpoint | Counter | Audit
      >()
      expectTypeOf<Effect.Success<ReturnType<typeof Journal.make>>>().toEqualTypeOf<Journal.Journal["Service"]>()
      const host = Layer.mergeAll(
        Layer.succeed(Store.Store, fixture.store),
        Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints),
        Layer.succeed(Counter, fixture.counter),
        Layer.succeed(Audit, {
          check: Ref.get(reject).pipe(Effect.flatMap((value) => (value ? Effect.fail(rejection) : Effect.void)))
        })
      )
      const live = configured.pipe(Layer.provide(Log.layer), Layer.provide(host))
      expectTypeOf<Layer.Services<typeof live>>().toEqualTypeOf<never>()
      const consume = Effect.gen(function* () {
        const journal = yield* Journal.Journal
        expect(Option.isNone(yield* Effect.serviceOption(Counter))).toBe(true)
        expect(Option.isNone(yield* Effect.serviceOption(Audit))).toBe(true)
        yield* journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(Changed, 2)
            yield* journal.commit(journal.publish(Changed, 3))
          })
        )
        expect(yield* fixture.counter.get).toBe(5)
        expect(yield* Ref.get(finalized)).toBe(2)
        yield* journal.replay
        yield* Ref.set(reject, true)
        const error = yield* journal
          .publish(Changed, 7)

          .pipe(
            Effect.match({
              onFailure: (failure) => failure,
              onSuccess: () => undefined
            })
          )
        if (!Schema.is(Projection.Failure)(error)) throw new Error("Expected projection failure")
        expect(error.cause).toBe(rejection)
        expect(error.key.name).toBe("audit")
        expect(error.phase).toBe("apply")
        expect(yield* fixture.counter.get).toBe(5)
        expect((yield* fixture.snapshot).logs.get(journal.log.id)).toHaveLength(1)
      })
      expectTypeOf<Effect.Services<typeof consume>>().toEqualTypeOf<Journal.Journal | Publication.Publication>()
      expectTypeOf<Effect.Error<typeof consume>>().toEqualTypeOf<Projection.Error | Log.WriteError>()
      const acquire = Effect.gen(function* () {
        const transaction = yield* Transaction.make
        const logs = yield* Log.make.pipe(Effect.provideService(Transaction.Transaction, transaction))
        return yield* Journal.make({
          logId: Entry.LogId.make("domain"),
          projections: [counter, audit]
        }).pipe(Effect.provideService(Log.Log, logs), Effect.provideService(Transaction.Transaction, transaction))
      }).pipe(Effect.provide(host))
      const direct = Effect.flatMap(acquire, (journal) =>
        consume.pipe(
          Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
          Effect.provideService(Journal.Journal, journal)
        )
      )
      expectTypeOf<Effect.Services<typeof direct>>().toEqualTypeOf<never>()
      yield* construction === "make"
        ? direct
        : consume.pipe(
            Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
            Effect.provide(live)
          )
    })
)

it.effect("each evaluation of the transaction constructor owns a separate coordinator", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const acquire = Transaction.make
    expectTypeOf<Effect.Success<typeof acquire>>().toEqualTypeOf<Transaction.Transaction["Service"]>()
    expectTypeOf<Effect.Services<typeof acquire>>().toEqualTypeOf<Store.Store>()
    expectTypeOf<Effect.Success<typeof Log.make>>().toEqualTypeOf<Log.Log["Service"]>()
    expectTypeOf<Effect.Services<typeof Log.make>>().toEqualTypeOf<Store.Store | Transaction.Transaction>()
    yield* Effect.gen(function* () {
      const first = yield* acquire
      const second = yield* acquire
      const failure = yield* Effect.flip(first.run(second.run(Effect.void)))
      expect(failure._tag).toBe("Transaction.Foreign")
      expect(yield* fixture.attempts).toBe(1)
      yield* second.run(second.run(Effect.void))
      expect(yield* fixture.attempts).toBe(2)
    }).pipe(Effect.provideService(Store.Store, fixture.store))
  })
)

it.effect("binding inside an earlier commit never reuses its transaction or scope", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const finalized = yield* Ref.make(0)
    const boundIn = new Set<string>()
    const scoped = counter.on(
      Changed,
      Effect.fn("ServiceTest.scoped")(function* () {
        expect(boundIn.has((yield* Store.Transaction).id)).toBe(false)
        yield* Effect.addFinalizer(() => Ref.update(finalized, (count) => count + 1))
      })
    )
    yield* Effect.gen(function* () {
      const log = yield* Log.Log
      const journal = yield* log.commit(
        Effect.gen(function* () {
          boundIn.add((yield* Store.Transaction).id)
          return yield* Journal.make({ logId: Entry.LogId.make("domain"), projections: [scoped] })
        })
      )
      yield* journal
        .publish(Changed, 1)
        .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
      expect(yield* Ref.get(finalized)).toBe(1)
      yield* journal.commit(
        Effect.forEach([2, 3], (amount) =>
          journal
            .publish(Changed, amount)
            .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
        )
      )
      expect(yield* Ref.get(finalized)).toBe(3)
      expect(yield* fixture.counter.get).toBe(6)
      expect(yield* fixture.attempts).toBe(3)
      const source = yield* Journal.make({ logId: Entry.LogId.make("history"), projections: [] })
      yield* source
        .publish(Changed, 4)
        .pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
      const bound = yield* log.commit(
        Effect.gen(function* () {
          boundIn.add((yield* Store.Transaction).id)
          return yield* Projection.makeRunner({ definition: scoped, log: source.log })
        })
      )
      expectTypeOf<Effect.Services<typeof bound.replay>>().toEqualTypeOf<never>()
      yield* bound.replay
      expect(yield* fixture.counter.get).toBe(10)
      expect(yield* Ref.get(finalized)).toBe(4)
    }).pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Store, fixture.store),
      Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
      Effect.provideService(Counter, fixture.counter)
    )
  })
)

it.effect("projection defects remain defects and still roll back the publication", () =>
  Effect.gen(function* () {
    const fixture = yield* make()
    const broken = counter.on(Changed, () => Effect.die(new Error("bug in handler")))
    const live = Journal.layer({ logId: Entry.LogId.make("domain"), projections: [broken] }).pipe(
      Layer.provide(Log.layer),
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(Store.Store, fixture.store),
          Layer.succeed(Checkpoint.Checkpoint, fixture.checkpoints),
          Layer.succeed(Counter, fixture.counter)
        )
      )
    )
    yield* Effect.gen(function* () {
      const journal = yield* Journal.Journal
      const exit = yield* Effect.exit(
        journal.publish(Changed, 1).pipe(Effect.provideService(Publication.Publication, testProvenance(workspaceId)))
      )
      if (!Exit.isFailure(exit)) throw new Error("Expected defect")
      expect(Cause.hasDies(exit.cause)).toBe(true)
      expect(Cause.hasFails(exit.cause)).toBe(false)
      expect(yield* fixture.counter.get).toBe(0)
      expect((yield* fixture.snapshot).logs.size).toBe(0)
      expect((yield* fixture.snapshot).checkpoints.size).toBe(0)
    }).pipe(Effect.provide(live))
  })
)
