import { Commit, CommittedEvents, Entry } from "@amends/core/journal";
import { Workspace } from "@amends/core/workspace";
import { expect, test } from "bun:test";
import { Context, DateTime, Effect, Exit, Fiber, Layer, Scope, Stream } from "effect";
import { WorkspaceEvents } from "../src/workspace-events.ts";

const one = Workspace.Id.make("workspace-one");
const two = Workspace.Id.make("workspace-two");
const batch = (workspaceId: Workspace.Id, id: string): CommittedEvents.Batch => ({
  workspaceId,
  commitId: Commit.Id.make(id),
  events: [
    {
      id: Entry.Id.make(`${id}-event`),
      logId: Entry.LogId.make("journal"),
      position: Entry.Position.make(0),
      commitId: Commit.Id.make(id),
      index: 0,
      recordedAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
      name: "example.changed",
      version: 1,
      payload: { value: id },
    },
  ],
});
const run = <A, E>(program: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(program));

test.each(["make", "layer"] as const)(
  "registry %s shares concurrent workspace acquisitions and isolates their events",
  async (construction) =>
    run(
      Effect.gen(function* () {
        const registry =
          construction === "make"
            ? yield* WorkspaceEvents.make()
            : Context.get(yield* Layer.build(WorkspaceEvents.layer()), WorkspaceEvents.Service);
        const firstScope = yield* Scope.fork(yield* Scope.Scope);
        const secondScope = yield* Scope.fork(yield* Scope.Scope);
        const [a, b, other] = yield* Effect.all(
          [
            registry.forWorkspace(one).pipe(Scope.provide(firstScope)),
            registry.forWorkspace(one).pipe(Scope.provide(secondScope)),
            registry.forWorkspace(two),
          ],
          { concurrency: "unbounded" },
        );
        expect(a).toBe(b);
        expect(other).not.toBe(a);
        const inOne = yield* a.subscribe.pipe(Scope.provide(firstScope));
        const inTwo = yield* other.subscribe;
        yield* b.publish(batch(one, "a"));
        yield* other.publish(batch(two, "b"));
        expect(yield* inOne.pipe(Stream.take(1), Stream.runCollect)).toEqual([batch(one, "a")]);
        expect(yield* inTwo.pipe(Stream.take(1), Stream.runCollect)).toEqual([batch(two, "b")]);
        yield* Scope.close(firstScope, Exit.void);
        // Closing one request cannot shut down a bus another request is still using.
        const stillOpen = yield* b.subscribe.pipe(Scope.provide(secondScope));
        yield* b.publish(batch(one, "next"));
        expect(yield* stillOpen.pipe(Stream.take(1), Stream.runCollect)).toEqual([
          batch(one, "next"),
        ]);
      }),
    ),
);

test("the last lease releases its bus and later requests acquire a fresh live bus", async () =>
  run(
    Effect.gen(function* () {
      const registry = yield* WorkspaceEvents.make();
      const request = yield* Scope.fork(yield* Scope.Scope);
      const previous = yield* registry.forWorkspace(one).pipe(Scope.provide(request));
      yield* previous.publish(batch(one, "before"));
      yield* Scope.close(request, Exit.void);
      expect(yield* Effect.flip(previous.publish(batch(one, "closed")))).toMatchObject({
        _tag: "CommittedEvents.Closed",
      });
      const current = yield* registry.forWorkspace(one);
      expect(current).not.toBe(previous);
      const stream = yield* current.subscribe;
      yield* current.publish(batch(one, "after"));
      expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toEqual([batch(one, "after")]);
    }),
  ));

test("registry shutdown interrupts readers even while a consumer holds a lease", async () =>
  run(
    Effect.gen(function* () {
      const owner = yield* Scope.fork(yield* Scope.Scope);
      const registry = yield* WorkspaceEvents.make().pipe(Scope.provide(owner));
      const bus = yield* registry.forWorkspace(one);
      const stream = yield* bus.subscribe;
      const waiting = yield* stream.pipe(
        Stream.runDrain,
        Effect.forkChild({ startImmediately: true }),
      );
      yield* Scope.close(owner, Exit.void);
      expect(Exit.hasInterrupts(yield* Fiber.await(waiting))).toBe(true);
      expect(yield* Effect.flip(bus.publish(batch(one, "closed")))).toMatchObject({
        _tag: "CommittedEvents.Closed",
      });
      expect(Exit.hasInterrupts(yield* Effect.exit(registry.forWorkspace(one)))).toBe(true);
    }),
  ));

test("independently constructed registries never share buses or events", async () =>
  run(
    Effect.gen(function* () {
      const first = yield* WorkspaceEvents.make();
      const second = yield* WorkspaceEvents.make();
      const a = yield* first.forWorkspace(one);
      const b = yield* second.forWorkspace(one);
      expect(a).not.toBe(b);
      const stream = yield* b.subscribe;
      yield* a.publish(batch(one, "other-process"));
      yield* b.publish(batch(one, "local"));
      expect(yield* stream.pipe(Stream.take(1), Stream.runCollect)).toEqual([batch(one, "local")]);
    }),
  ));

test("registry rejects invalid configuration and workspace IDs before acquisition", async () =>
  run(
    Effect.gen(function* () {
      expect(yield* Effect.flip(WorkspaceEvents.make({ capacity: 0 }))).toMatchObject({
        _tag: "SchemaError",
      });
      const registry = yield* WorkspaceEvents.make();
      const input = { workspaceId: one };
      Reflect.set(input, "workspaceId", "");
      expect(yield* Effect.flip(registry.forWorkspace(input.workspaceId))).toMatchObject({
        _tag: "SchemaError",
      });
      const bus = yield* registry.forWorkspace(one);
      expect(bus.workspaceId).toBe(one);
    }),
  ));
