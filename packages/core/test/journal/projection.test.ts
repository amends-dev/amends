import { expect, test } from "bun:test";
import { Context, Deferred, Effect, Fiber, Option, Ref, Schema, SchemaGetter } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Codec } from "../../src/journal/codec.ts";
import { Entry } from "../../src/journal/entry.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { Counter, make, type Fixture } from "../memory-store.ts";

const logId = Log.Id.make("domain");
const Changed = Fact.make("counter.changed", {
  version: 1,
  payload: Schema.Struct({ amount: Schema.FiniteFromString }),
});
const Unrelated = Fact.make("unrelated", { version: 1, payload: Schema.String });
const add = Effect.fn("ProjectionTest.add")(function* (event: Projection.Input<typeof Changed>) {
  yield* (yield* Counter).add(event.payload.amount);
});
const definition = Projection.make("counter", { version: 1 }).on(Changed, add);
const source = Journal.make({ logId, projections: [] });
const runner = Effect.gen(function* () {
  const journal = yield* source;
  return yield* Projection.makeRunner({ definition, log: journal.log });
});

const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<A, E, Log.Service | Transaction.Service | Counter | Checkpoint.Service>,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
      Effect.provideService(Counter, fixture.counter),
    ),
  );

test("replay checkpoints a complete batch and resumes with a fresh runner", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(Changed, { amount: 2 });
          yield* journal.publish(Changed, { amount: 3 });
        }),
      );
      yield* journal.publish(Unrelated, "ignored");
      yield* journal.publish(Changed, { amount: 7 });
      const first = yield* runner;
      const cursor = yield* first.step;
      expect(Option.isSome(cursor) && cursor.value.index).toBe(1);
      expect(yield* (yield* Counter).get).toBe(5);
      expect(yield* first.checkpoint).toEqual(cursor);
    }),
  );
  await run(
    fixture,
    Effect.gen(function* () {
      const resumed = yield* runner;
      const cursor = yield* resumed.replay;
      expect(Option.isSome(cursor) && cursor.value.position).toBe(Log.Position.make(2));
      expect(yield* (yield* Counter).get).toBe(12);
      expect(Option.isNone(yield* resumed.step)).toBe(true);
      expect((yield* fixture.snapshot).logs.get(logId)).toHaveLength(3);
    }),
  );
});

test("a failed batch rolls back every handler and preserves previously committed progress", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(Changed, { amount: 1 });
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(Changed, { amount: 2 });
          yield* journal.publish(Changed, { amount: 3 });
        }),
      );
      yield* journal.publish(Changed, { amount: 4 });
      const rejecting = definition.on(Changed, (event) =>
        event.payload.amount === 3 ? Effect.fail("rejected") : Effect.void,
      );
      const failed = yield* Projection.makeRunner({ definition: rejecting, log: journal.log });
      expect(yield* Effect.flip(failed.replay)).toMatchObject({
        _tag: "Projection.Failure",
        phase: "apply",
        cause: "rejected",
        key: { logId, name: "counter", version: 1 },
        cursor: { position: Log.Position.make(1), index: 1 },
      });
      expect(yield* (yield* Counter).get).toBe(1);
      const cursor = yield* failed.checkpoint;
      expect(Option.isSome(cursor) && cursor.value.position).toBe(Log.Position.make(0));
      const resumed = yield* runner;
      yield* resumed.replay;
      expect(yield* (yield* Counter).get).toBe(10);
    }),
  );
});

test("checkpoint persistence failures roll back replay and live projection writes", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      yield* (yield* source).publish(Changed, { amount: 2 });
    }),
  );
  const broken = {
    ...fixture,
    checkpoints: Checkpoint.Service.of({
      ...fixture.checkpoints,
      set: () =>
        Effect.fail(new Store.Failure({ operation: "checkpoint.set", cause: "unavailable" })),
    }),
  };
  await run(
    broken,
    Effect.gen(function* () {
      const replay = yield* runner;
      expect((yield* Effect.flip(replay.step))._tag).toBe("JournalStore.Failure");
      const journal = yield* Journal.make({
        logId: Log.Id.make("new-domain"),
        projections: [definition],
      });
      expect((yield* Effect.flip(journal.publish(Changed, { amount: 5 })))._tag).toBe(
        "JournalStore.Failure",
      );
      expect(yield* (yield* Counter).get).toBe(0);
      expect((yield* fixture.snapshot).checkpoints.size).toBe(0);
      expect((yield* fixture.snapshot).logs.size).toBe(1);
    }),
  );
});

test("independent concurrent runners serialize progress instead of applying a batch twice", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      for (const amount of [1, 2, 3]) yield* journal.publish(Changed, { amount });
    }),
  );
  const drain = Effect.gen(function* () {
    yield* (yield* runner).replay;
  });
  await Promise.all([run(fixture, drain), run(fixture, drain)]);
  expect(await Effect.runPromise(fixture.counter.get)).toBe(6);
});

test("live publishing requires catch-up and shares replay checkpoints across nested commits", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const writer = yield* source;
      yield* writer.publish(Changed, { amount: 1 });
      const journal = yield* Journal.make({ logId, projections: [definition] });
      expect((yield* Effect.flip(journal.publish(Changed, { amount: 100 })))._tag).toBe(
        "Projection.Behind",
      );
      expect((yield* fixture.snapshot).logs.get(logId)).toHaveLength(1);
      expect(yield* (yield* Counter).get).toBe(0);
      yield* journal.replay;
      const last = yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(Changed, { amount: 2 });
          yield* journal.replay;
          yield* journal.commit(journal.publish(Unrelated, "checkpoint this too"));
          return yield* journal.publish(Changed, { amount: 3 });
        }),
      );
      yield* journal.replay;
      expect(yield* (yield* Counter).get).toBe(6);
      const cursor = yield* (yield* runner).checkpoint;
      expect(cursor).toEqual(
        Option.some({
          position: last.position,
          commitId: last.commitId,
          index: 2,
          entryId: last.id,
        }),
      );
      expect((yield* fixture.snapshot).logs.get(logId)).toHaveLength(2);
    }),
  );
});

test("unrelated facts advance progress but unsupported versions fail without skipping history", async () => {
  const fixture = await Effect.runPromise(make());
  const ChangedV2 = Fact.make(Changed.name, {
    version: 2,
    payload: Schema.Struct({ amount: Schema.Finite }),
  });
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(Unrelated, "unrelated");
      yield* journal.commit(
        Effect.gen(function* () {
          yield* journal.publish(Changed, { amount: 1 });
          yield* journal.publish(ChangedV2, { amount: 2 });
        }),
      );
      const original = yield* runner;
      expect((yield* Effect.flip(original.replay))._tag).toBe("Projection.UnsupportedFactVersion");
      expect(yield* (yield* Counter).get).toBe(0);
      const checkpoint = yield* original.checkpoint;
      expect(Option.isSome(checkpoint) && checkpoint.value.position).toBe(Log.Position.make(0));
      const compatible = yield* Projection.makeRunner({
        definition: definition.on(ChangedV2, (event) =>
          Effect.flatMap(Counter, (counter) => counter.add(event.payload.amount)),
        ),
        log: journal.log,
      });
      yield* compatible.replay;
      expect(yield* (yield* Counter).get).toBe(3);
    }),
  );
});

test("invalid or partial durable checkpoints fail before applying more events", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      const first = yield* journal.commit(
        Effect.gen(function* () {
          const entry = yield* journal.publish(Changed, { amount: 1 });
          yield* journal.publish(Changed, { amount: 2 });
          return entry;
        }),
      );
      const bound = yield* runner;
      const checkpoints = yield* Checkpoint.Service;
      for (const entryId of [first.id, Entry.Id.make("missing-entry")]) {
        yield* journal.commit(
          checkpoints.set(bound.key, {
            position: first.position,
            commitId: first.commitId,
            index: first.index,
            entryId,
          }),
        );
        expect((yield* Effect.flip(bound.step))._tag).toBe("Projection.InvalidCheckpoint");
        expect(yield* (yield* Counter).get).toBe(0);
      }
    }),
  );
});

test("interruption during replay rolls back projection changes and progress together", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(Changed, { amount: 4 });
      const ready = yield* Deferred.make<void>();
      const blocking = definition.on(Changed, () =>
        Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)),
      );
      const bound = yield* Projection.makeRunner({ definition: blocking, log: journal.log });
      const fiber = yield* bound.step.pipe(Effect.forkChild);
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      expect(yield* (yield* Counter).get).toBe(0);
      expect(Option.isNone(yield* bound.checkpoint)).toBe(true);
      expect((yield* fixture.snapshot).logs.get(logId)).toHaveLength(1);
    }),
  );
});

test("an uncertain replay commit can resume from its persisted checkpoint without double application", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(Changed, { amount: 4 });
      const bound = yield* runner;
      yield* fixture.loseNextAcknowledgment;
      expect((yield* Effect.flip(bound.step))._tag).toBe("JournalStore.CommitUncertain");
      expect(yield* fixture.attempts).toBe(2);
      expect(Option.isSome(yield* bound.checkpoint)).toBe(true);
      expect(yield* (yield* Counter).get).toBe(4);
    }),
  );
  await run(
    fixture,
    Effect.gen(function* () {
      yield* (yield* runner).replay;
      expect(yield* (yield* Counter).get).toBe(4);
    }),
  );
});

test("replay handlers cannot append and a caught failure poisons the outer commit", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      yield* journal.publish(Changed, { amount: 1 });
      const turn = (yield* Log.Service).open({
        id: Log.Id.make("turn/one"),
        schema: Schema.String,
      });
      const recursive = definition.on(Changed, () => turn.append("forbidden").pipe(Effect.asVoid));
      const bound = yield* Projection.makeRunner({ definition: recursive, log: journal.log });
      expect(yield* Effect.flip(bound.step)).toMatchObject({
        _tag: "Projection.Failure",
        phase: "apply",
        cause: { _tag: "Commit.WriteForbidden" },
      });
      const result = yield* Effect.flip(
        journal.commit(bound.step.pipe(Effect.catch(() => Effect.void))),
      );
      expect(result._tag).toBe("Commit.Aborted");
      expect(yield* (yield* Counter).get).toBe(0);
      expect(Option.isNone(yield* bound.checkpoint)).toBe(true);
      expect((yield* fixture.snapshot).logs.size).toBe(1);
    }),
  );
});

test("checkpoint keys isolate log, projection name, and version; duplicate registration is rejected", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      const other = yield* Journal.make({ logId: Log.Id.make("other"), projections: [] });
      yield* journal.publish(Unrelated, "one");
      yield* other.publish(Unrelated, "two");
      for (const [log, name, version] of [
        [journal.log, "a", 1],
        [journal.log, "b", 1],
        [journal.log, "a", 2],
        [other.log, "a", 1],
      ] as const) {
        const bound = yield* Projection.makeRunner({
          definition: Projection.make(name, { version }),
          log,
        });
        expect(Option.isNone(yield* bound.checkpoint)).toBe(true);
        yield* bound.replay;
        expect(Option.isSome(yield* bound.checkpoint)).toBe(true);
      }
      expect((yield* fixture.snapshot).checkpoints.size).toBe(4);
      expect(
        (yield* Effect.flip(Journal.make({ logId, projections: [definition, definition] })))._tag,
      ).toBe("Projection.Duplicate");
    }),
  );
});

test("historical decoding resolves services, runs once per event, and cannot append", async () => {
  const fixture = await Effect.runPromise(make());
  class Decoder extends Context.Service<
    Decoder,
    { readonly decode: (value: number) => Effect.Effect<number> }
  >()("ProjectionTest/Decoder") {}
  const payload = Schema.Finite.pipe(
    Schema.decodeTo(Schema.Finite, {
      decode: SchemaGetter.transformEffect((value) =>
        Effect.flatMap(Decoder, (service) => service.decode(value)),
      ),
      encode: SchemaGetter.passthrough(),
    }),
  );
  const Decoded = Fact.make("decoded", { version: 1, payload });
  const decoded = Projection.make("decoded", { version: 1 })
    .on(
      Decoded,
      Effect.fn("ProjectionTest.decoded")(function* (event) {
        yield* (yield* Counter).add(event.payload);
      }),
    )
    .on(Decoded, () => Effect.void);
  const decodes = await Effect.runPromise(Ref.make(0));
  const decoder = {
    decode: (value: number) => Ref.update(decodes, (count) => count + 1).pipe(Effect.as(value)),
  };
  await run(
    fixture,
    Effect.gen(function* () {
      yield* (yield* source).publish(Decoded, 2).pipe(Effect.provideService(Decoder, decoder));
      const journal = yield* Journal.make({ logId, projections: [decoded] }).pipe(
        Effect.provideService(Decoder, decoder),
      );
      yield* journal.replay;
      yield* journal.publish(Decoded, 3).pipe(Effect.provideService(Decoder, decoder));
      expect(yield* (yield* Counter).get).toBe(5);
      expect(yield* Ref.get(decodes)).toBe(3);
      const turn = (yield* Log.Service).open({
        id: Log.Id.make("decoder-log"),
        schema: Schema.String,
      });
      const fresh = yield* Projection.makeRunner({
        definition: Projection.make("fresh", { version: 1 }).on(Decoded, (event) =>
          Effect.flatMap(Counter, (counter) => counter.add(event.payload)),
        ),
        log: journal.log,
      }).pipe(
        Effect.provideService(Decoder, {
          decode: (value) =>
            turn.append("forbidden").pipe(
              Effect.catch(() => Effect.void),
              Effect.as(value),
            ),
        }),
      );
      const failure = yield* Effect.flip(fresh.step);
      expect(failure._tag).toBe("Commit.Aborted");
      expect(yield* (yield* Counter).get).toBe(5);
      expect(Option.isNone(yield* fresh.checkpoint)).toBe(true);
      expect((yield* fixture.snapshot).logs.size).toBe(1);
    }),
  );
});

test("corrupt fact payloads roll back earlier handlers in the same replay batch", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const raw = (yield* Log.Service).open({ id: logId, schema: Journal.Envelope });
      yield* raw.appendAll([
        {
          name: Changed.name,
          version: Changed.version,
          payload: yield* Codec.make(Changed).encode({ amount: 1 }),
        },
        { name: Changed.name, version: Changed.version, payload: new Uint8Array() },
      ]);
      const bound = yield* runner;
      expect(yield* Effect.flip(bound.step)).toMatchObject({
        _tag: "Projection.Failure",
        phase: "decode",
        cause: { _tag: "SchemaError" },
      });
      expect(yield* (yield* Counter).get).toBe(0);
      expect(Option.isNone(yield* bound.checkpoint)).toBe(true);
    }),
  );
});

test("live projection application rejects entries from another native transaction", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const journal = yield* source;
      const event = yield* journal.publish(Changed, { amount: 1 });
      const batch = yield* journal.log.get(event.commitId);
      if (Option.isNone(batch)) throw new Error("Missing source batch");
      const entry = batch.value.entries[0];
      if (entry === undefined) throw new Error("Missing source entry");
      const bound = yield* runner;
      const failure = yield* Effect.flip(journal.commit(bound.apply(entry, event)));
      expect(failure._tag).toBe("Commit.Foreign");
      expect(yield* (yield* Counter).get).toBe(0);
      expect(Option.isNone(yield* bound.checkpoint)).toBe(true);
    }),
  );
});
