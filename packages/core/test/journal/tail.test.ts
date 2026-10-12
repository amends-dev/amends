import { Subject } from "@amends-dev/core/journal";
import * as Publication from "../../src/journal/Publication.ts";
import { testProvenance } from "../publication.ts";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Option, Ref, Schema, Stream } from "effect";
import * as Checkpoint from "../../src/journal/Checkpoint.ts";
import * as Codec from "../../src/journal/Codec.ts";
import * as Fact from "../../src/journal/Fact.ts";
import * as Event from "../../src/journal/Event.ts";
import * as Journal from "../../src/journal/Journal.ts";
import * as Entry from "../../src/journal/Entry.ts";
import * as Log from "../../src/journal/Log.ts";
import * as Projection from "../../src/journal/Projection.ts";
import * as Store from "../../src/journal/Store.ts";
import * as WorkspaceId from "../../src/workspace/WorkspaceId.ts";
import * as Transaction from "../../src/journal/Transaction.ts";
import { Counter, make, type Fixture } from "../memory.ts";

const testSubject = () => Subject.make("test", "entity");
const workspaceId = WorkspaceId.Id.make("workspace-one");
const logId = Entry.LogId.make("turn/one");
const open = Effect.map(Log.Log, (log) => log.open({ id: logId, schema: Schema.String }));
const run = <A, E>(
  fixture: Fixture,
  program: Effect.Effect<
    A,
    E,
    Publication.Publication | Log.Log | Transaction.Transaction | Counter | Checkpoint.Checkpoint
  >,
) =>
  program.pipe(
    Effect.provideService(Publication.Publication, testProvenance(workspaceId)),
    Effect.provide(Log.layer),
    Effect.provideService(Store.Store, fixture.store),
    Effect.provideService(Checkpoint.Checkpoint, fixture.checkpoints),
    Effect.provideService(Counter, fixture.counter),
  );
const observeWait = (fixture: Fixture, ready: Deferred.Deferred<void>): Fixture => ({
  ...fixture,
  store: Store.Store.of({
    ...fixture.store,
    waitForAppend: (id, after) =>
      Deferred.succeed(ready, undefined).pipe(
        Effect.andThen(fixture.store.waitForAppend(id, after)),
      ),
  }),
});
it.effect("a tail resumes after its cursor, drains history, and waits for a future commit", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const ready = yield* Deferred.make<void>();
    yield* run(
      observeWait(fixture, ready),
      Effect.gen(function* () {
        const log = yield* open;
        const first = yield* log.append("first");
        yield* log.append("second");
        const tail = yield* log
          .tail({ after: first.position, limit: 10 })
          .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild);
        yield* Deferred.await(ready);
        yield* log.append("third");
        const batches = yield* Fiber.join(tail);
        expect(batches.flatMap((batch) => batch.entries.map((entry) => entry.payload))).toEqual([
          "second",
          "third",
        ]);
        expect(batches.map((batch) => batch.position)).toEqual([
          Entry.Position.make(1),
          Entry.Position.make(2),
        ]);
      }),
    );
  }),
);

it.effect("a commit between the empty read and wait registration is not lost", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const payload = yield* Codec.makeForSchema(Schema.String).encode("raced");
    let inject = true;
    let waits = 0;
    const raced: Fixture = {
      ...fixture,
      store: Store.Store.of({
        ...fixture.store,
        read: Effect.fn("TailTest.racedRead")(function* (id, options) {
          const batches = yield* fixture.store.read(id, options);
          if (inject) {
            inject = false;
            expect(batches).toHaveLength(0);
            // Simulate another writer using the host, outside this Log service.
            yield* fixture.store
              .transaction(
                Effect.gen(function* () {
                  yield* (yield* Store.Transaction).append({ logId: id, entries: [{ payload }] });
                }),
              )
              .pipe(
                Effect.mapError(
                  (cause) => new Store.Failure({ operation: "test external append", cause }),
                ),
              );
          }
          return batches;
        }),
        waitForAppend: Effect.fn("TailTest.racedWait")(function* (id, after) {
          waits++;
          yield* fixture.store.waitForAppend(id, after);
        }),
      }),
    };
    yield* run(
      raced,
      Effect.gen(function* () {
        const log = yield* open;
        const batches = yield* log.tail({ limit: 1 }).pipe(Stream.take(1), Stream.runCollect);
        expect(batches[0]?.entries[0]?.payload).toBe("raced");
        expect(waits).toBe(1);
      }),
    );
  }),
);

it.effect("short pages and a slow consumer preserve order without reading ahead", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    let reads = 0;
    const short: Fixture = {
      ...fixture,
      store: Store.Store.of({
        ...fixture.store,
        read: Effect.fn("TailTest.shortRead")(function* (id, options) {
          reads++;
          return yield* fixture.store.read(
            id,
            options.after === undefined ? { limit: 1 } : { after: options.after, limit: 1 },
          );
        }),
      }),
    };
    yield* run(
      short,
      Effect.gen(function* () {
        const log = yield* open;
        yield* log.append("one");
        yield* log.append("two");
        const received = yield* Ref.make<ReadonlyArray<string>>([]);
        const ready = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const tail = yield* log.tail({ limit: 10 }).pipe(
          Stream.take(3),
          Stream.runForEach(
            Effect.fnUntraced(function* (batch) {
              yield* Ref.update(received, (values) => [
                ...values,
                ...batch.entries.map((entry) => entry.payload),
              ]);
              if (batch.position === Entry.Position.make(0)) {
                yield* Deferred.succeed(ready, undefined);
                yield* Deferred.await(release);
              }
            }),
          ),
          Effect.forkChild,
        );
        yield* Deferred.await(ready);
        yield* log.append("three");
        expect(reads).toBe(1);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(tail);
        expect(yield* Ref.get(received)).toEqual(["one", "two", "three"]);
        expect(reads).toBe(3);
      }),
    );
  }),
);
const Changed = Fact.make("counter.changed", {
  subject: testSubject,
  version: 1,
  payload: Schema.Finite,
});
const projection = Projection.make("counter", { version: 1 }).on(
  Changed,
  Effect.fn("TailTest.project")(function* (event) {
    yield* (yield* Counter).add(event.payload);
  }),
);
const domain = Journal.make({ logId: Entry.LogId.make("domain"), projections: [projection] });
it.effect(
  "journal tails expose complete batches only after projection and cross-log writes commit",
  () =>
    Effect.gen(function* () {
      const fixture = yield* make();
      const ready = yield* Deferred.make<void>();
      yield* run(
        observeWait(fixture, ready),
        Effect.gen(function* () {
          const journal = yield* domain;
          const turn = yield* open;
          const staged = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const seen = yield* Ref.make(false);
          const tail = yield* journal.log.tail({ limit: 1 }).pipe(
            Stream.take(1),
            Stream.mapEffect((batch) =>
              Ref.set(seen, true).pipe(
                Effect.andThen(
                  Effect.gen(function* () {
                    expect(yield* fixture.counter.get).toBe(3);
                    return batch;
                  }),
                ),
              ),
            ),
            Stream.runCollect,
            Effect.forkChild,
          );
          yield* Deferred.await(ready);
          const writer = yield* journal
            .commit(
              Effect.gen(function* () {
                yield* journal.publish(Changed, 1);
                yield* turn.append("execution detail");
                yield* journal.publish(Changed, 2);
                yield* Deferred.succeed(staged, undefined);
                yield* Deferred.await(release);
              }),
            )
            .pipe(Effect.forkChild);
          yield* Deferred.await(staged);
          expect(yield* Ref.get(seen)).toBe(false);
          expect(yield* fixture.counter.get).toBe(0);
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(writer);
          const batches = yield* Fiber.join(tail);
          expect(batches).toHaveLength(1);
          expect(batches[0]?.entries.map((entry) => entry.index)).toEqual([0, 1]);
          expect(batches[0]?.commit.entryCount).toBe(3);
          expect((yield* turn.read({ limit: 1 }))[0]?.commit.id).toBe(batches[0]?.commit.id);
        }),
      );
    }),
);

it.effect("tails ignore rolled-back appends and observe commits with lost acknowledgments", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const ready = yield* Deferred.make<void>();
    yield* run(
      observeWait(fixture, ready),
      Effect.gen(function* () {
        const journal = yield* domain;
        const tail = yield* journal.log
          .tail({ limit: 1 })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
        yield* Deferred.await(ready);
        expect(
          yield* Effect.flip(
            journal.commit(
              Effect.gen(function* () {
                yield* journal.publish(Changed, 99);
                return yield* Effect.fail("rollback");
              }),
            ),
          ),
        ).toBe("rollback");
        yield* fixture.loseNextAcknowledgment;
        expect((yield* Effect.flip(journal.publish(Changed, 1)))._tag).toBe(
          "JournalStore.CommitUncertain",
        );
        const batches = yield* Fiber.join(tail);
        const entry = batches[0]?.entries[0];
        if (entry === undefined) throw new Error("Missing committed event");
        expect((yield* Event.decode(Changed, entry)).payload).toBe(1);
        expect(yield* fixture.counter.get).toBe(1);
      }),
    );
  }),
);

it.effect("consumers wait independently and interruption releases the host wait", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const ready = yield* Deferred.make<void>();
    let active = 0;
    const watched: Fixture = {
      ...fixture,
      store: Store.Store.of({
        ...fixture.store,
        waitForAppend: (id, after) =>
          Effect.acquireUseRelease(
            Effect.sync(() => ++active),
            (count) =>
              Effect.gen(function* () {
                if (count === 2) yield* Deferred.succeed(ready, undefined);
                yield* fixture.store.waitForAppend(id, after);
              }),
            () =>
              Effect.sync(() => {
                active--;
              }),
          ),
      }),
    };
    yield* run(
      watched,
      Effect.gen(function* () {
        const log = yield* open;
        const first = yield* log
          .tail({ limit: 1 })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
        const second = yield* log
          .tail({ limit: 1 })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
        yield* Deferred.await(ready);
        yield* Fiber.interrupt(first);
        expect(active).toBe(1);
        const other = (yield* Log.Log).open({
          id: Entry.LogId.make("unrelated"),
          schema: Schema.String,
        });
        yield* other.append("ignore");
        yield* log.append("keep");
        const batches = yield* Fiber.join(second);
        expect(batches[0]?.entries[0]?.payload).toBe("keep");
        expect(active).toBe(0);
        const resumed = yield* log.tail({ limit: 1 }).pipe(Stream.take(1), Stream.runCollect);
        expect(resumed).toEqual(batches);
        expect(active).toBe(0);
      }),
    );
  }),
);

it.effect("spurious wakeups re-read storage and failures terminate the tail unchanged", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    const failure = new Store.Failure({ operation: "waitForAppend", cause: "connection lost" });
    let waits = 0;
    let reads = 0;
    const broken: Fixture = {
      ...fixture,
      store: Store.Store.of({
        ...fixture.store,
        read: (id, options) =>
          Effect.sync(() => {
            reads++;
          }).pipe(Effect.andThen(fixture.store.read(id, options))),
        waitForAppend: () =>
          Effect.suspend(() => (++waits === 1 ? Effect.void : Effect.fail(failure))),
      }),
    };
    yield* run(
      broken,
      Effect.gen(function* () {
        const log = yield* open;
        expect(yield* Effect.flip(Stream.runDrain(log.tail({ limit: 1 })))).toBe(failure);
        expect(reads).toBe(2);
        expect(waits).toBe(2);
        expect((yield* Effect.flip(Stream.runDrain(log.tail({ limit: 0 }))))._tag).toBe(
          "SchemaError",
        );
        expect(reads).toBe(2);
        expect(waits).toBe(2);
      }),
    );
  }),
);

it.effect("tail consumption inside a transaction is rejected before reading or waiting", () =>
  Effect.gen(function* () {
    const fixture = yield* make();
    let reads = 0;
    const watched: Fixture = {
      ...fixture,
      store: Store.Store.of({
        ...fixture.store,
        read: (id, options) =>
          Effect.sync(() => {
            reads++;
          }).pipe(Effect.andThen(fixture.store.read(id, options))),
        waitForAppend: () => Effect.die("Must not wait inside a transaction"),
      }),
    };
    yield* run(
      watched,
      Effect.gen(function* () {
        const log = yield* Log.Log;
        const watchedLog = yield* open;
        const tail = watchedLog.tail({ limit: 1 });
        const failure = yield* Effect.flip(
          log.commit(
            Effect.gen(function* () {
              yield* watchedLog.append("staged");
              yield* Stream.runDrain(tail);
            }),
          ),
        );
        expect(failure._tag).toBe("Log.TailInTransaction");
        expect(reads).toBe(0);
        expect((yield* fixture.snapshot).logs.size).toBe(0);
        // Creating a tail is lazy; only the context in which it is consumed matters.
        const created = yield* log.commit(Effect.succeed(watchedLog.tail({ limit: 1 })));
        yield* watchedLog.append("committed");
        const batches = yield* created.pipe(Stream.take(1), Stream.runCollect);
        expect(batches[0]?.entries[0]?.payload).toBe("committed");
        expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
      }),
    );
  }),
);
