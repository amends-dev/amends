import { expect, test } from "bun:test";
import { Context, DateTime, Effect, Exit, Fiber, Layer, Schema, Scope, Stream } from "effect";
import { Commit } from "../../src/journal/commit.ts";
import { CommittedEvents } from "../../src/journal/committed-events.ts";
import { Entry } from "../../src/journal/entry.ts";
import { Event } from "../../src/journal/event.ts";
import { Fact } from "../../src/journal/fact.ts";
import { WorkspaceId } from "../../src/workspace/id.ts";

const workspaceId = WorkspaceId.Id.make("workspace-one");
const otherWorkspaceId = WorkspaceId.Id.make("workspace-two");
const Changed = Fact.make("example.changed", {
  version: 1,
  payload: Schema.Struct({ amount: Schema.FiniteFromString, at: Schema.DateTimeUtcFromString }),
});
const batch = (id: string): CommittedEvents.Batch => ({
  workspaceId,
  commitId: Commit.Id.make(id),
  events: [
    Event.makeSchema(Changed).make({
      id: Entry.Id.make(`${id}-event`),
      logId: Entry.LogId.make("journal"),
      position: Entry.Position.make(0),
      commitId: Commit.Id.make(id),
      index: 0,
      recordedAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
      provenance: null,
      name: Changed.name,
      version: Changed.version,
      payload: { amount: 2, at: DateTime.makeUnsafe("2026-09-20T11:00:00.000Z") },
    }),
  ],
});
const next = (
  stream: Stream.Stream<CommittedEvents.Batch, CommittedEvents.Lagged | CommittedEvents.Closed>,
) => stream.pipe(Stream.take(1), Stream.runCollect);
const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program));

test.each(["make", "layer"] as const)(
  "bus %s broadcasts canonical batches to every registered subscriber",
  async (construction) =>
    run(
      Effect.gen(function* () {
        const bus =
          construction === "make"
            ? yield* CommittedEvents.make(workspaceId)
            : Context.get(
                yield* Layer.build(CommittedEvents.layer(workspaceId)),
                CommittedEvents.Service,
              );
        const one = yield* bus.subscribe;
        const two = yield* bus.subscribe;
        const first = batch("first");
        const input: CommittedEvents.Batch = {
          workspaceId: first.workspaceId,
          commitId: first.commitId,
          events: [
            first.events[0],
            { ...first.events[0], id: Entry.Id.make("second-event"), index: 1 },
          ],
        };
        // Both subscriptions are active even though neither stream has started pulling yet.
        yield* bus.publish(input);
        const a = yield* next(one);
        const b = yield* next(two);
        expect(a).toEqual([input]);
        expect(b).toEqual(a);
        expect(a[0]?.events[0]?.payload).toBe(input.events[0].payload);
        expect(Object.isFrozen(a[0]?.events[0])).toBe(true);
        expect(Object.isFrozen(a[0]?.events)).toBe(true);
        expect(Object.isFrozen(a[0])).toBe(true);
      }),
    ),
);

test("subscriptions start live and publication owns its envelope and metadata", async () =>
  run(
    Effect.gen(function* () {
      const bus = yield* CommittedEvents.make(workspaceId);
      yield* bus.publish(batch("before-subscription"));
      const stream = yield* bus.subscribe;
      const input = batch("after-subscription");
      const expected = batch("after-subscription");
      yield* bus.publish(input);
      Reflect.set(input, "commitId", Commit.Id.make("mutated"));
      Reflect.set(input.events[0], "id", Entry.Id.make("mutated"));
      Reflect.set(input.events, "length", 0);
      expect(yield* next(stream)).toEqual([expected]);
    }),
  ));

test("foreign workspaces and malformed batches cannot enter a bus", async () =>
  run(
    Effect.gen(function* () {
      const bus = yield* CommittedEvents.make(workspaceId);
      const stream = yield* bus.subscribe;
      const foreign = batch("foreign");
      Reflect.set(foreign, "workspaceId", otherWorkspaceId);
      expect(yield* Effect.flip(bus.publish(foreign))).toMatchObject({
        _tag: "CommittedEvents.WorkspaceMismatch",
        expectedWorkspaceId: workspaceId,
        actualWorkspaceId: otherWorkspaceId,
      });
      const wrongCommit = batch("wrong-commit");
      Reflect.set(wrongCommit.events[0], "commitId", Commit.Id.make("another-commit"));
      const empty = batch("empty");
      Reflect.set(empty.events, "length", 0);
      const duplicate = batch("duplicate");
      Reflect.set(duplicate, "events", [duplicate.events[0], duplicate.events[0]]);
      for (const invalid of [wrongCommit, empty, duplicate])
        expect(yield* Effect.flip(bus.publish(invalid))).toMatchObject({ _tag: "SchemaError" });
      const good = batch("good");
      yield* bus.publish(good);
      expect(yield* next(stream)).toEqual([good]);
    }),
  ));

test("a slow subscriber fails explicitly without blocking publishers or a healthy subscriber", async () =>
  run(
    Effect.gen(function* () {
      const bus = yield* CommittedEvents.make(workspaceId, { capacity: 2 });
      const slow = yield* bus.subscribe;
      const fast = yield* bus.subscribe;
      for (const id of ["one", "two", "three"]) {
        const value = batch(id);
        yield* bus.publish(value);
        expect(yield* next(fast)).toEqual([value]);
      }
      expect(yield* Effect.flip(next(slow))).toMatchObject({
        _tag: "CommittedEvents.Lagged",
        workspaceId,
      });
      const fresh = yield* bus.subscribe;
      const value = batch("four");
      yield* bus.publish(value);
      expect(yield* Effect.flip(next(slow))).toMatchObject({ _tag: "CommittedEvents.Lagged" });
      expect(yield* next(fast)).toEqual([value]);
      expect(yield* next(fresh)).toEqual([value]);
    }),
  ));

test("concurrent publications reach subscribers in the same order with no spurious gaps", async () =>
  run(
    Effect.gen(function* () {
      const bus = yield* CommittedEvents.make(workspaceId);
      const one = yield* bus.subscribe;
      const two = yield* bus.subscribe;
      const values = Array.from({ length: 80 }, (_, index) => batch(String(index)));
      yield* Effect.forEach(values, bus.publish, { concurrency: "unbounded", discard: true });
      const a = yield* one.pipe(Stream.take(values.length), Stream.runCollect);
      const b = yield* two.pipe(Stream.take(values.length), Stream.runCollect);
      expect(a).toEqual(b);
      expect(new Set(a.map((value) => value.commitId))).toEqual(
        new Set(values.map((value) => value.commitId)),
      );
    }),
  ));

test("closing a subscription interrupts its pending read and leaves other subscribers usable", async () =>
  run(
    Effect.gen(function* () {
      const bus = yield* CommittedEvents.make(workspaceId, { capacity: 1 });
      const readerScope = yield* Scope.fork(yield* Scope.Scope);
      const abandoned = yield* bus.subscribe.pipe(Scope.provide(readerScope));
      const healthy = yield* bus.subscribe;
      const waiting = yield* next(abandoned).pipe(Effect.forkChild({ startImmediately: true }));
      yield* Scope.close(readerScope, Exit.void);
      expect(Exit.hasInterrupts(yield* Fiber.await(waiting))).toBe(true);
      for (const id of ["one", "two"]) {
        const value = batch(id);
        yield* bus.publish(value);
        expect(yield* next(healthy)).toEqual([value]);
      }
    }),
  ));

test("closing the bus interrupts pending reads and rejects escaped handles", async () =>
  run(
    Effect.gen(function* () {
      const owner = yield* Scope.fork(yield* Scope.Scope);
      const bus = yield* CommittedEvents.make(workspaceId).pipe(Scope.provide(owner));
      const stream = yield* bus.subscribe;
      const waiting = yield* next(stream).pipe(Effect.forkChild({ startImmediately: true }));
      yield* Scope.close(owner, Exit.void);
      expect(Exit.hasInterrupts(yield* Fiber.await(waiting))).toBe(true);
      expect(yield* Effect.flip(bus.publish(batch("closed")))).toMatchObject({
        _tag: "CommittedEvents.Closed",
      });
      expect(yield* Effect.flip(bus.subscribe)).toMatchObject({ _tag: "CommittedEvents.Closed" });
    }),
  ));

test("bus construction rejects invalid buffer capacity", async () =>
  run(
    Effect.gen(function* () {
      for (const capacity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
        expect(yield* Effect.flip(CommittedEvents.make(workspaceId, { capacity }))).toMatchObject({
          _tag: "SchemaError",
        });
    }),
  ));
