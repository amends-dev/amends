import { expect, expectTypeOf, test } from "bun:test";
import { Cause, Context, Effect, Exit, Layer, Option, Ref, Schema } from "effect";
import { Checkpoint } from "../src/journal/checkpoint.ts";
import { Fact } from "../src/journal/fact.ts";
import { Journal } from "../src/journal/journal.ts";
import { Log } from "../src/journal/log.ts";
import { Projection } from "../src/journal/projection.ts";
import { Store } from "../src/journal/store.ts";
import { Transaction } from "../src/journal/transaction.ts";
import { Counter, make } from "./memory-store.ts";

const Changed = Fact.make("counter.changed", { version: 1, payload: Schema.Finite });
const counter = Projection.make("counter", { version: 1 }).on(
  Changed,
  Effect.fn("ServiceTest.count")(function* (event) {
    yield* (yield* Counter).add(event.payload);
  }),
);

class Rejected extends Schema.TaggedError<Rejected>()("ServiceTest.Rejected", {
  reason: Schema.String,
}) {}
class Audit extends Context.Service<Audit, { readonly check: Effect.Effect<void, Rejected> }>()(
  "ServiceTest/Audit",
) {}

test("the journal layer binds heterogeneous projections behind one stable service", async () => {
  const fixture = await Effect.runPromise(make());
  const reject = await Effect.runPromise(Ref.make(false));
  const finalized = await Effect.runPromise(Ref.make(0));
  const rejection = new Rejected({ reason: "test rejection" });
  const audit = Projection.make("audit", { version: 1 }).on(
    Changed,
    Effect.fn("ServiceTest.audit")(function* (event) {
      yield* (yield* Audit).check;
      const native = yield* Store.Transaction;
      expect(native.id).toBe(event.commitId);
      yield* Effect.addFinalizer(() => Ref.update(finalized, (count) => count + 1));
    }),
  );
  const configured = Journal.layer({ logId: Log.Id.make("domain"), projections: [counter, audit] });
  const registrations = [counter, audit];
  const fromArray = Journal.layer({ logId: Log.Id.make("domain"), projections: registrations });
  expectTypeOf<Layer.Services<typeof fromArray>>().toEqualTypeOf<
    Layer.Services<typeof configured>
  >();
  expectTypeOf<Layer.Success<typeof configured>>().toEqualTypeOf<Journal.Service>();
  expectTypeOf<Layer.Services<typeof configured>>().toEqualTypeOf<
    Log.Service | Transaction.Service | Checkpoint.Service | Counter | Audit
  >();
  expectTypeOf<
    Effect.Success<ReturnType<typeof Journal.make>>
  >().toEqualTypeOf<Journal.Interface>();
  const host = Layer.mergeAll(
    Layer.succeed(Store.Service, fixture.store),
    Layer.succeed(Checkpoint.Service, fixture.checkpoints),
    Layer.succeed(Counter, fixture.counter),
    Layer.succeed(Audit, {
      check: Ref.get(reject).pipe(
        Effect.flatMap((value) => (value ? Effect.fail(rejection) : Effect.void)),
      ),
    }),
  );
  const live = configured.pipe(Layer.provide(Log.layer), Layer.provide(host));
  expectTypeOf<Layer.Services<typeof live>>().toEqualTypeOf<never>();

  const consume = Effect.gen(function* () {
    const journal = yield* Journal.Service;
    expect(Option.isNone(yield* Effect.serviceOption(Counter))).toBe(true);
    expect(Option.isNone(yield* Effect.serviceOption(Audit))).toBe(true);
    yield* journal.commit(
      Effect.gen(function* () {
        yield* journal.publish(Changed, 2);
        yield* journal.commit(journal.publish(Changed, 3));
      }),
    );
    expect(yield* fixture.counter.get).toBe(5);
    expect(yield* Ref.get(finalized)).toBe(2);
    yield* journal.replay;
    yield* Ref.set(reject, true);
    const error = yield* journal.publish(Changed, 7).pipe(
      Effect.match({
        onFailure: (failure) => failure,
        onSuccess: () => undefined,
      }),
    );
    if (error?._tag !== "Projection.Failure") throw new Error("Expected projection failure");
    expect(error.cause).toBe(rejection);
    expect(error.key.name).toBe("audit");
    expect(error.phase).toBe("apply");
    expect(yield* fixture.counter.get).toBe(5);
    expect((yield* fixture.snapshot).logs.get(journal.log.id)).toHaveLength(1);
  });
  expectTypeOf<Effect.Services<typeof consume>>().toEqualTypeOf<Journal.Service>();
  expectTypeOf<Effect.Error<typeof consume>>().toEqualTypeOf<Projection.Error | Log.WriteError>();
  await Effect.runPromise(consume.pipe(Effect.provide(live)));
});

test("binding inside an earlier commit never reuses its transaction or scope", async () => {
  const fixture = await Effect.runPromise(make());
  const finalized = await Effect.runPromise(Ref.make(0));
  const boundIn = new Set<string>();
  const scoped = counter.on(
    Changed,
    Effect.fn("ServiceTest.scoped")(function* () {
      expect(boundIn.has((yield* Store.Transaction).id)).toBe(false);
      yield* Effect.addFinalizer(() => Ref.update(finalized, (count) => count + 1));
    }),
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const logs = yield* Log.Service;
      const journal = yield* logs.commit(
        Effect.gen(function* () {
          boundIn.add((yield* Store.Transaction).id);
          return yield* Journal.make({ logId: Log.Id.make("domain"), projections: [scoped] });
        }),
      );
      yield* journal.publish(Changed, 1);
      expect(yield* Ref.get(finalized)).toBe(1);
      yield* journal.commit(
        Effect.forEach([2, 3], (amount) => journal.publish(Changed, amount), {
          concurrency: "unbounded",
        }),
      );
      expect(yield* Ref.get(finalized)).toBe(3);
      expect(yield* fixture.counter.get).toBe(6);
      expect(yield* fixture.attempts).toBe(3);

      const source = yield* Journal.make({ logId: Log.Id.make("history"), projections: [] });
      yield* source.publish(Changed, 4);
      const bound = yield* logs.commit(
        Effect.gen(function* () {
          boundIn.add((yield* Store.Transaction).id);
          return yield* Projection.bind({ definition: scoped, log: source.log });
        }),
      );
      expectTypeOf<Effect.Services<typeof bound.replay>>().toEqualTypeOf<never>();
      yield* bound.replay;
      expect(yield* fixture.counter.get).toBe(10);
      expect(yield* Ref.get(finalized)).toBe(4);
    }).pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(Counter, fixture.counter),
    ),
  );
});

test("projection defects remain defects and still roll back the publication", async () => {
  const fixture = await Effect.runPromise(make());
  const broken = counter.on(Changed, () => Effect.die(new Error("bug in handler")));
  const live = Journal.layer({ logId: Log.Id.make("domain"), projections: [broken] }).pipe(
    Layer.provide(Log.layer),
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(Store.Service, fixture.store),
        Layer.succeed(Checkpoint.Service, fixture.checkpoints),
        Layer.succeed(Counter, fixture.counter),
      ),
    ),
  );
  await Effect.runPromise(
    Effect.gen(function* () {
      const journal = yield* Journal.Service;
      const exit = yield* Effect.exit(journal.publish(Changed, 1));
      if (!Exit.isFailure(exit)) throw new Error("Expected defect");
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(Cause.hasFails(exit.cause)).toBe(false);
      expect(yield* fixture.counter.get).toBe(0);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
      expect((yield* fixture.snapshot).checkpoints.size).toBe(0);
    }).pipe(Effect.provide(live)),
  );
});
