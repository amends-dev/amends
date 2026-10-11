/**
 * Core's stores over memory storage, bound to one workspace, with what the journal tests count
 * and inject: transactions attempted, standalone appends, a lost commit acknowledgment, and a
 * counter that projections write inside the transaction.
 */
import { Context, Effect, Layer, Ref } from "effect";
import { AssignmentStore, RoleStore } from "../src/authorization/index.ts";
import type { Commit } from "../src/journal/index.ts";
import { Checkpoint, Store } from "../src/journal/index.ts";
import { Binding } from "../src/memory/binding.ts";
import { MemoryConnection } from "../src/memory/connection.ts";
import { MemoryDatabase } from "../src/memory/database.ts";
import { MemoryStores } from "../src/memory/stores.ts";
import { MemberStore, Workspace } from "../src/workspace/index.ts";

/** A projection target: a number the transaction stages, like any projected record. */
export class Counter extends Context.Service<
  Counter,
  {
    readonly add: (amount: number) => Effect.Effect<void, Store.Failure, Store.Transaction>;
    readonly get: Effect.Effect<number>;
  }
>()("JournalTest/Counter") {}

/** New memory storage with one host over it, and the stores bound to `workspaceId`. */
export const make = Effect.fn("JournalTest.memory")(function* (
  workspaceId: Workspace.Id = Workspace.Id.make("workspace-one"),
) {
  const database = yield* MemoryDatabase.make();
  const memoryConnection = yield* MemoryConnection.make().pipe(
    Effect.provideService(MemoryDatabase.Service, database),
  );
  /** The stores bound to one workspace over this host's connection. */
  const bind = Effect.fn("JournalTest.bind")(function* (id: Workspace.Id) {
    const context = yield* Layer.build(
      Layer.merge(MemoryStores.layer(id), Binding.layer(id)).pipe(
        Layer.provide(Layer.succeed(MemoryConnection.Service, memoryConnection)),
      ),
    );
    return {
      context,
      binding: Context.get(context, Binding.Service),
      store: Context.get(context, Store.Service),
      checkpoints: Context.get(context, Checkpoint.Service),
      members: Context.get(context, MemberStore.Service),
      roles: Context.get(context, RoleStore.Service),
      assignments: Context.get(context, AssignmentStore.Service),
    };
  });
  const bound = yield* bind(workspaceId);
  const { binding } = bound;
  const inner = bound.store;
  const attempts = yield* Ref.make(0);
  const standalone = yield* Ref.make(0);
  const uncertain = yield* Ref.make(false);

  const counter = Counter.of({
    add: Effect.fn("JournalTest.counter.add")(function* (amount) {
      yield* Store.Transaction;
      const rows = (yield* binding.write).records.of("counter");
      const next = Number(rows.get("value") ?? 0) + amount;
      yield* Effect.yieldNow;
      rows.set("value", String(next));
    }),
    get: Effect.map(Effect.orDie(binding.read), (space) =>
      Number(space.records.of("counter").get("value") ?? 0),
    ),
  });

  /**
   * The store, counting what it is asked, and reporting the next commit as uncertain when asked:
   * it commits, but what its program asked to run afterwards never runs.
   */
  const store = Store.Service.of({
    ...inner,
    transaction: <A, E, R>(program: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* Ref.update(attempts, (count) => count + 1);
        const committed: Array<Effect.Effect<void>> = [];
        let commitId: Commit.Id | undefined;
        const result = yield* inner.transaction(
          Effect.flatMap(Store.Transaction, (native) => {
            commitId = native.id;
            return program.pipe(
              Effect.provideService(Store.Transaction, {
                ...native,
                afterCommit: (effect) =>
                  Effect.andThen(
                    native.afterCommit(Effect.void),
                    Effect.sync(() => void committed.push(effect)),
                  ),
              }),
            );
          }),
        );
        if (yield* Ref.getAndSet(uncertain, false)) {
          if (commitId === undefined) return yield* Effect.die("The transaction never began");
          return yield* new Store.CommitUncertain({ commitId, cause: "lost acknowledgment" });
        }
        yield* Store.runAfterCommit(committed);
        return result;
      }),
    append: (request) =>
      Effect.andThen(
        Ref.update(standalone, (count) => count + 1),
        inner.append(request),
      ),
  });

  return {
    store,
    counter,
    checkpoints: bound.checkpoints,
    members: bound.members,
    roles: bound.roles,
    assignments: bound.assignments,
    /** Another workspace's stores over the same storage and connection. */
    bind,
    /** Workspace transactions begun, whether or not they committed. */
    attempts: Ref.get(attempts),
    /** Standalone appends committed or attempted, outside any workspace transaction. */
    standalone: Ref.get(standalone),
    /** The workspace's committed logs and checkpoints. */
    snapshot: Effect.sync(() => {
      const space = MemoryDatabase.committed(database, workspaceId);
      return {
        logs: space.logs,
        checkpoints: space.records.of("checkpoints"),
        members: space.records.of("members"),
        roles: space.records.of("roles"),
        assignments: space.records.of("assignments"),
      };
    }),
    loseNextAcknowledgment: Ref.set(uncertain, true),
  };
});

export type Fixture = Effect.Success<ReturnType<typeof make>>;
