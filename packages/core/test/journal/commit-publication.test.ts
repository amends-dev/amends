import { expect, test } from "bun:test";
import { Deferred, Effect, Exit, Fiber, Layer, Logger, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { Checkpoint } from "../../src/journal/checkpoint.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Fact } from "../../src/journal/fact.ts";
import { Journal } from "../../src/journal/journal.ts";
import { Log } from "../../src/journal/log.ts";
import { Projection } from "../../src/journal/projection.ts";
import { Store } from "../../src/journal/store.ts";
import { Transaction } from "../../src/journal/transaction.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";
import { Counter, make, type Fixture } from "../memory-store.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const Changed = Fact.make("counter.changed", {
  version: 1,
  payload: Schema.Struct({ amount: Schema.FiniteFromString }),
});
const projection = Projection.make("counter", { version: 1 }).on(Changed, (event) =>
  Effect.flatMap(Counter, (counter) => counter.add(event.payload.amount)),
);
const setup = Journal.make({ logId: Log.Id.make("journal"), projections: [projection] });
type Services =
  | Log.Service
  | Transaction.Service
  | Store.Service
  | Checkpoint.Service
  | Counter
  | CommittedEvents.Service
  | Scope.Scope;
const run = <A, E>(
  use: (fixture: Fixture, published: Array<CommittedEvents.Batch>) => Effect.Effect<A, E, Services>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fixture = yield* make();
      const bus = yield* CommittedEvents.make(workspaceId);
      const published: Array<CommittedEvents.Batch> = [];
      const events = CommittedEvents.Service.of({
        ...bus,
        publish: (batch) =>
          bus.publish(batch).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                published.push(batch);
              }),
            ),
          ),
      });
      return yield* use(fixture, published).pipe(
        Effect.provide(Log.layer),
        Effect.provideService(Store.Service, fixture.store),
        Effect.provideService(Checkpoint.Service, fixture.checkpoints),
        Effect.provideService(Counter, fixture.counter),
        Effect.provideService(CommittedEvents.Service, events),
      );
    }).pipe(Effect.scoped),
  );

test("one outer commit publishes canonical events once, in order, after its projections commit", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const journal = yield* setup;
      const stream = yield* (yield* CommittedEvents.Service).subscribe;
      const events = yield* journal.commit(
        Effect.gen(function* () {
          const first = yield* journal.publish(Changed, { amount: 2 });
          const second = yield* journal.commit(journal.publish(Changed, { amount: 3 }));
          expect(published).toEqual([]);
          expect((yield* fixture.snapshot).logs.size).toBe(0);
          return [first, second];
        }),
      );
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({ workspaceId, events });
      expect(published[0]?.events.map((event) => event.index)).toEqual([0, 1]);
      expect(published[0]?.events[0]?.payload).toBe(events[0]?.payload);
      expect((yield* fixture.snapshot).value).toBe(5);
      expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toEqual(published);
    }),
  ));

test("rollback and caught nested failure discard every collected event", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const journal = yield* setup;
      const rollback = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(Changed, { amount: 2 });
            return yield* Effect.fail("rollback");
          }),
        ),
      );
      expect(rollback).toBe("rollback");
      const caught = yield* Effect.flip(
        journal.commit(
          Effect.gen(function* () {
            yield* journal.publish(Changed, { amount: 3 });
            yield* journal.commit(Effect.fail("nested failure")).pipe(Effect.ignore);
          }),
        ),
      );
      expect(caught).toMatchObject({ _tag: "Commit.Aborted" });
      expect(published).toEqual([]);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
      expect((yield* fixture.snapshot).value).toBe(0);
    }),
  ));

test("failed projections never publish, even when the application catches their failure", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const fail = Projection.make("fail", { version: 1 }).on(Changed, () =>
        Effect.fail("projection failed"),
      );
      const journal = yield* Journal.make({
        logId: Log.Id.make("journal"),
        projections: [projection, fail],
      });
      expect(
        yield* Effect.flip(
          journal.commit(
            journal.publish(Changed, { amount: 4 }).pipe(Effect.catch(() => Effect.void)),
          ),
        ),
      ).toMatchObject({ _tag: "Commit.Aborted" });
      expect(published).toEqual([]);
      expect((yield* fixture.snapshot).value).toBe(0);
    }),
  ));

test("reads, replay, and execution-log-only commits do not publish domain events", async () =>
  run((_, published) =>
    Effect.gen(function* () {
      const journal = yield* setup;
      const logs = yield* Log.Service;
      const turn = logs.open({ id: Log.Id.make("turn/one"), schema: Schema.String });
      yield* journal.publish(Changed, { amount: 1 });
      expect(published).toHaveLength(1);
      yield* journal.commit(journal.log.read({ limit: 10 }));
      yield* journal.replay;
      const replay = yield* Journal.make({
        logId: journal.log.id,
        projections: [
          Projection.make("new-projection", { version: 1 }).on(Changed, () => Effect.void),
        ],
      });
      yield* replay.replay;
      yield* turn.append("execution progress");
      expect(published).toHaveLength(1);
      const secondJournal = yield* Journal.make({
        logId: Log.Id.make("another-journal"),
        projections: [],
      });
      yield* logs.commit(
        Effect.gen(function* () {
          yield* journal.publish(Changed, { amount: 2 });
          yield* turn.append("more progress");
          yield* secondJournal.publish(Changed, { amount: 3 });
        }),
      );
      expect(published).toHaveLength(2);
      expect(published[1]?.events.map((event) => event.logId)).toEqual([
        journal.log.id,
        secondJournal.log.id,
      ]);
      expect(new Set(published[1]?.events.map((event) => event.commitId)).size).toBe(1);
    }),
  ));

test("interruption before commit rolls back and publishes nothing", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const journal = yield* setup;
      const staged = yield* Deferred.make<void>();
      const writer = yield* journal
        .commit(
          Effect.gen(function* () {
            yield* journal.publish(Changed, { amount: 1 });
            yield* Deferred.succeed(staged, undefined);
            return yield* Effect.never;
          }),
        )
        .pipe(Effect.forkChild);
      yield* Deferred.await(staged);
      yield* Fiber.interrupt(writer);
      expect(Exit.hasInterrupts(yield* Fiber.await(writer))).toBe(true);
      expect(published).toEqual([]);
      expect((yield* fixture.snapshot).logs.size).toBe(0);
    }),
  ));

test("a pending interrupt after native commit cannot skip publication", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const committed = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      const wrapped = Store.Service.of({
        ...fixture.store,
        transaction: (program, options) =>
          fixture.store.transaction(program, {
            onCommit: Effect.gen(function* () {
              yield* Deferred.succeed(committed, undefined);
              yield* Deferred.await(resume);
              if (options?.onCommit !== undefined) yield* options.onCommit;
            }),
          }),
      });
      const journal = yield* setup.pipe(
        Effect.provide(Layer.fresh(Log.layer)),
        Effect.provideService(Store.Service, wrapped),
      );
      const writer = yield* journal.publish(Changed, { amount: 1 }).pipe(Effect.forkChild);
      yield* Deferred.await(committed);
      expect((yield* fixture.snapshot).value).toBe(1);
      expect(published).toEqual([]);
      const fiberId = yield* Effect.fiberId;
      yield* Effect.sync(() => writer.interruptUnsafe(fiberId));
      yield* Deferred.succeed(resume, undefined);
      expect(Exit.hasInterrupts(yield* Fiber.await(writer))).toBe(true);
      expect(published).toHaveLength(1);
    }),
  ));

test("an uncertain acknowledgment preserves its outcome without publishing or retrying", async () =>
  run((fixture, published) =>
    Effect.gen(function* () {
      const journal = yield* setup;
      yield* fixture.loseNextAcknowledgment;
      expect(yield* Effect.flip(journal.publish(Changed, { amount: 1 }))).toMatchObject({
        _tag: "JournalStore.CommitUncertain",
      });
      expect(published).toEqual([]);
      expect(yield* fixture.attempts).toBe(1);
      expect((yield* fixture.snapshot).value).toBe(1);
    }),
  ));

test.each(["failure", "defect"] as const)(
  "a publication %s is logged without changing the committed result",
  async (kind) =>
    run((fixture) =>
      Effect.gen(function* () {
        const logs: unknown[] = [];
        const logger = Logger.make((entry) => {
          logs.push(entry.message);
        });
        const bus = yield* CommittedEvents.Service;
        const failed = CommittedEvents.Service.of({
          ...bus,
          publish: () =>
            kind === "failure"
              ? Effect.fail(new CommittedEvents.Closed({ workspaceId }))
              : Effect.die("broken bus"),
        });
        const journal = yield* setup.pipe(
          Effect.provide(Layer.fresh(Log.layer)),
          Effect.provideService(CommittedEvents.Service, failed),
        );
        const event = yield* journal
          .publish(Changed, { amount: 5 })
          .pipe(Effect.provide(Logger.layer([logger])));
        expect(event.payload.amount).toBe(5);
        expect((yield* fixture.snapshot).value).toBe(5);
        expect(yield* fixture.attempts).toBe(1);
        expect(logs).toHaveLength(1);
      }),
    ),
);
