import { Publication } from "../../src/journal/publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, test } from "bun:test";
import { Deferred, Effect, Fiber, Option, Schema, Stream } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Store } from "../../src/journal/store.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { Counter, make, type Fixture } from "../memory-store.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");

const Changed = Fact.make("counter.changed", {
  version: 1,
  payload: Schema.Struct({ amount: Schema.FiniteFromString }),
});
const Harness = Schema.TaggedUnion({ Text: { text: Schema.String }, Finished: {} });
const projection = Projection.make("counter", { version: 1 }).on(
  Changed,
  Effect.fn("Test.project")(function* (event) {
    const counter = yield* Counter;
    yield* counter.add(event.payload.amount);
  }),
);

const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Publication.Service | Log.Service | Transaction.Service | Counter | Checkpoint.Service
  >,
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provideService(Publication.Service, testProvenance(workspaceId)),
      Effect.provide(Log.layer),
      Effect.provideService(Store.Service, fixture.store),
      Effect.provide(CommittedEvents.layer(workspaceId)),
      Effect.provideService(Counter, fixture.counter),
      Effect.provideService(Checkpoint.Service, fixture.checkpoints),
    ),
  );

const setup = Effect.gen(function* () {
  const logs = yield* Log.Service;
  const journal = yield* Journal.make({ logId: Log.Id.make("domain"), projections: [projection] });
  const turn = logs.open({ id: Log.Id.make("turn/one"), schema: Harness });
  return { logs, journal, turn };
});

test("facts and turn output use independent logs through the same storage", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      const event = yield* journal.publish(Changed, { amount: 2 });
      yield* turn.append({ _tag: "Text", text: "working" });
      yield* turn.append({ _tag: "Finished" });
      const domain = yield* journal.log.read({ limit: 10 });
      const output = yield* Stream.runCollect(turn.stream({ limit: 1 }));
      expect(domain).toHaveLength(1);
      expect(output.map((batch) => batch.position)).toEqual([
        Log.Position.make(0),
        Log.Position.make(1),
      ]);
      expect(output.flatMap((batch) => batch.entries.map((entry) => entry.payload._tag))).toEqual([
        "Text",
        "Finished",
      ]);
      expect(event.logId).toBe(journal.log.id);
      expect(event.payload.amount).toBe(2);
      expect(yield* (yield* Counter).get).toBe(2);
      const raw = domain[0]?.entries[0];
      if (raw === undefined) throw new Error("Missing fact");
      expect((yield* Journal.decode(Changed, raw)).payload.amount).toBe(2);
    }),
  );
});

test("one explicit commit spans logs, nested commits, and projections", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      const entries = yield* journal.commit(
        Effect.gen(function* () {
          const first = yield* journal.publish(Changed, { amount: 1 });
          const output = yield* turn.append({ _tag: "Text", text: "inside" });
          const second = yield* journal.commit(journal.publish(Changed, { amount: 2 }));
          expect(yield* (yield* Counter).get).toBe(3);
          return [first, output, second];
        }),
      );
      expect(new Set(entries.map((entry) => entry.commitId)).size).toBe(1);
      const domain = yield* journal.log.read({ limit: 10 });
      const output = yield* turn.read({ limit: 10 });
      expect(domain).toHaveLength(1);
      expect(domain[0]?.entries.map((entry) => entry.index)).toEqual([0, 1]);
      expect(output[0]?.entries.map((entry) => entry.index)).toEqual([0]);
      expect(domain[0]?.commit.entryCount).toBe(3);
      expect(output[0]?.commit.entryCount).toBe(3);
      expect(yield* fixture.attempts).toBe(1);
    }),
  );
});

test("a caught projection failure still rolls back all logs and projection state", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { logs, turn } = yield* setup;
      const failing = projection.on(Changed, () => Effect.fail("Rejected"));
      const journal = yield* Journal.make({ logId: Log.Id.make("domain"), projections: [failing] });
      const failure = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* turn.append({ _tag: "Text", text: "will roll back" });
            yield* journal.publish(Changed, { amount: 7 }).pipe(Effect.catch(() => Effect.void));
          }),
        ),
      );
      expect(failure._tag).toBe("Commit.Aborted");
      expect((yield* fixture.snapshot).logs.size).toBe(0);
      expect(yield* (yield* Counter).get).toBe(0);
      yield* logs.commit(Effect.void);
    }),
  );
});

test("parallel publications preserve append and projection order", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal } = yield* setup;
      yield* journal.commit(
        Effect.forEach([1, 2, 3, 4], (amount) => journal.publish(Changed, { amount }), {
          concurrency: "unbounded",
        }),
      );
      const batches = yield* journal.log.read({ limit: 10 });
      expect(batches).toHaveLength(1);
      expect(batches[0]?.entries.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
      expect(yield* (yield* Counter).get).toBe(10);
    }),
  );
});

test("interruption rolls back staged entries and projection changes", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      const ready = yield* Deferred.make<void>();
      const fiber = yield* journal
        .commit(
          Effect.gen(function* () {
            yield* turn.append({ _tag: "Text", text: "pending" });
            yield* journal.publish(Changed, { amount: 5 });
            yield* Deferred.succeed(ready, undefined);
            return yield* Effect.never;
          }),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(ready);
      yield* Fiber.interrupt(fiber);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
      expect(yield* (yield* Counter).get).toBe(0);
    }),
  );
});

test("projections cannot recursively append execution or fact entries", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { turn } = yield* setup;
      const invalid = Projection.make("invalid", { version: 1 }).on(Changed, () =>
        turn.append({ _tag: "Finished" }).pipe(Effect.asVoid),
      );
      const journal = yield* Journal.make({ logId: Log.Id.make("domain"), projections: [invalid] });
      const failure = yield* Effect.flip(journal.publish(Changed, { amount: 1 }));
      expect(failure).toMatchObject({
        _tag: "Projection.Failure",
        phase: "apply",
        cause: { _tag: "Commit.WriteForbidden" },
      });
      expect((yield* fixture.snapshot).logs.size).toBe(0);
    }),
  );
});

test("uncertain commit outcomes preserve identity and are not automatically retried", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal } = yield* setup;
      yield* fixture.loseNextAcknowledgment;
      const failure = yield* Effect.flip(journal.publish(Changed, { amount: 1 }));
      if (failure._tag !== "JournalStore.CommitUncertain")
        throw new Error("Expected uncertain outcome");
      expect(Option.isSome(yield* journal.log.get(failure.commitId))).toBe(true);
      expect(yield* (yield* Counter).get).toBe(1);
      expect(yield* fixture.attempts).toBe(1);
    }),
  );
});

test("escaped transaction contexts cannot append after completion", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      const captured = yield* journal.commit(Effect.context<never>());
      const failure = yield* Effect.flip(
        turn.append({ _tag: "Finished" }).pipe(Effect.provideContext(captured)),
      );
      expect(failure._tag).toBe("Commit.Closed");
      expect(yield* fixture.attempts).toBe(1);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
    }),
  );
});

test("expected positions and replay cursors are scoped to their log", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      const first = yield* turn.append(
        { _tag: "Text", text: "first" },
        { expectedAfter: Option.none() },
      );
      yield* journal.publish(Changed, { amount: 1 });
      yield* turn.append({ _tag: "Finished" }, { expectedAfter: Option.some(first.position) });
      const conflict = yield* Effect.flip(
        turn.append({ _tag: "Finished" }, { expectedAfter: Option.none() }),
      );
      expect(conflict._tag).toBe("JournalStore.Conflict");
      const resumed = yield* Stream.runCollect(turn.stream({ after: first.position, limit: 1 }));
      expect(resumed).toHaveLength(1);
      expect(resumed[0]?.entries[0]?.payload._tag).toBe("Finished");
    }),
  );
});

test("readers reject batches from another log", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { journal, turn } = yield* setup;
      yield* journal.publish(Changed, { amount: 1 });
      yield* turn.append({ _tag: "Finished" });
    }),
  );
  const corrupt = {
    ...fixture,
    store: Store.Service.of({
      ...fixture.store,
      read: (_id, options) => fixture.store.read(Log.Id.make("domain"), options),
    }),
  };
  await run(
    corrupt,
    Effect.gen(function* () {
      const { turn } = yield* setup;
      const failure = yield* Effect.flip(turn.read({ limit: 10 }));
      expect(failure._tag).toBe("SchemaError");
    }),
  );
});

test("replay continues through short pages and respects consumer demand", async () => {
  const fixture = await Effect.runPromise(make());
  await run(
    fixture,
    Effect.gen(function* () {
      const { turn } = yield* setup;
      yield* turn.append({ _tag: "Text", text: "one" });
      yield* turn.append({ _tag: "Text", text: "two" });
      yield* turn.append({ _tag: "Finished" });
    }),
  );
  let reads = 0;
  const shortPages = {
    ...fixture,
    store: Store.Service.of({
      ...fixture.store,
      read: (id, options) =>
        fixture.store
          .read(id, options.after === undefined ? { limit: 1 } : { after: options.after, limit: 1 })
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                reads++;
              }),
            ),
          ),
    }),
  };
  await run(
    shortPages,
    Effect.gen(function* () {
      const { turn } = yield* setup;
      const all = yield* Stream.runCollect(turn.stream({ limit: 3 }));
      expect(all).toHaveLength(3);
      expect(reads).toBe(4);
      reads = 0;
      yield* turn.stream({ limit: 3 }).pipe(Stream.take(1), Stream.runDrain);
      expect(reads).toBe(1);
    }),
  );
});
