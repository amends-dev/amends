/**
 * One workspace's view of memory storage: its identity, the transaction boundary every commit
 * runs inside, and the state each statement sees. Store modules require this service and
 * nothing else of each other; `MemoryStores.layer` provides it to all of them over the host's
 * `MemoryConnection`. `Journal` opens transactions through it, and `Notifications` runs its
 * exclusive writes through it.
 *
 * @since 0.1.0
 */
import { Commit, Store } from "../journal/index.ts";
import type { Workspace } from "../workspace/index.ts";
import { Context, DateTime, Effect, Exit, Layer, Option } from "effect";
import * as MemoryConnection from "./MemoryConnection.ts";
import * as MemoryDatabase from "./MemoryDatabase.ts";

/**
 * The handle core's `Store.Transaction` service holds while a transaction runs: the commit's ID,
 * its `append`, and `afterCommit`. `Journal` builds one for each session it opens.
 *
 * @category models
 * @since 0.1.0
 */
export type TransactionHandle = Context.Service.Shape<typeof Store.Transaction>;

/**
 * One open transaction: a snapshot of the workspace that its writes change until it commits.
 *
 * @category models
 * @since 0.1.0
 */
export interface TransactionState {
  /** The connection that opened it; a handle reaching another connection's binding fails. */
  readonly connection: MemoryConnection.MemoryConnection["Service"];
  readonly workspaceId: Workspace.Id;
  /** The commit it records, with the count of entries appended so far. */
  readonly commit: Commit.Commit;
  /** Its snapshot of the workspace, which its writes change and a commit makes committed. */
  readonly space: MemoryDatabase.Space;
  /** Logs this transaction holds against their other writers, released when it ends. */
  readonly held: Set<string>;
  /** What `afterCommit` asked to run once the transaction commits, in order. */
  readonly afterCommit: Array<Effect.Effect<void>>;
  /** Cleared when the transaction ends, so a handle kept past it fails. */
  active: boolean;
}

/**
 * Ask for `effect` to run once the session's transaction commits; a closed session's handle is
 * expired. `Journal` gives it to core as the handle's `afterCommit`.
 *
 * @category utils
 * @since 0.1.0
 */
export const afterCommit = (session: TransactionState, effect: Effect.Effect<void>) =>
  Effect.suspend(() => {
    if (!session.active)
      return Effect.fail(
        new Store.Failure({
          operation: "afterCommit",
          cause: "Missing, closed, or foreign workspace transaction",
        }),
      );
    session.afterCommit.push(effect);
    return Effect.void;
  });

/**
 * The session a program runs under; statements check it against their own binding. `transaction`
 * provides it beside core's `Store.Transaction`, and `Journal` reads it to hold logs.
 *
 * @category services
 * @since 0.1.0
 */
export class CurrentTransaction extends Context.Service<CurrentTransaction, TransactionState>()(
  "@amends-dev/core/memory/binding/Current",
) {}

/**
 * One workspace's view: what a read, a projection write, and a write outside the journal see, and
 * the transaction boundary. Every store module takes it, and `MemoryStores.layer` provides it.
 *
 * @category services
 * @since 0.1.0
 */
export class Binding extends Context.Service<
  Binding,
  {
    /** The workspace every store over this binding reads and writes. */
    readonly workspaceId: Workspace.Id;
    /** The host's connection: the storage the stores read, and the gate transactions take. */
    readonly connection: MemoryConnection.MemoryConnection["Service"];
    /**
     * What a read sees: the live transaction of this workspace on this connection, or committed
     * state outside any transaction. Any other transaction is a foreign or expired handle.
     */
    readonly read: Effect.Effect<MemoryDatabase.Space, Store.Failure>;
    /** What a projection write changes: the caller's transaction, which it requires. */
    readonly write: Effect.Effect<MemoryDatabase.Space, Store.Failure>;
    /** What a write outside the journal changes: the caller's transaction, or committed state. */
    readonly join: Effect.Effect<MemoryDatabase.Space, Store.Failure>;
    /**
     * Run a write outside the journal that reads before it writes: in the caller's transaction, or
     * else holding the workspace's writer over committed state, so no commit lands in between.
     */
    readonly exclusive: <A, E, R>(
      write: (space: MemoryDatabase.Space) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | Store.Failure | Store.Conflict, R>;
    /**
     * The store's transaction primitive, given how to expose the native handle for the session
     * it opens. See `Store.Store` for the contract. With `workspace: false` it does not take the
     * workspace's writer, for a standalone append that holds only its log, and commits only logs.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: TransactionState) => TransactionHandle,
      options?: { readonly workspace?: boolean },
    ) => Effect.Effect<
      A,
      E | Store.Failure | Store.Conflict | Store.CommitUncertain,
      Exclude<R, Store.Transaction>
    >;
  }
>()("@amends-dev/core/memory/binding/Service") {}

/**
 * Construct one workspace binding over the caller's connection.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("Binding.make")(function* (workspaceId: Workspace.Id) {
  const memoryConnection = yield* MemoryConnection.MemoryConnection;
  const { database, gate } = memoryConnection;

  /** The caller's live transaction here, None outside any, or a failure for any other. */
  const session = Effect.gen(function* () {
    const current = yield* Effect.serviceOption(CurrentTransaction);
    const native = yield* Effect.serviceOption(Store.Transaction);
    if (Option.isNone(current) && Option.isNone(native)) return Option.none<TransactionState>();
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      !current.value.active ||
      current.value.connection !== memoryConnection ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    )
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Missing, closed, or foreign workspace transaction",
      });
    return current;
  });
  const read = Effect.map(session, (current) =>
    Option.isSome(current) ? current.value.space : MemoryDatabase.committed(database, workspaceId),
  );
  const write = Effect.flatMap(session, (current) =>
    Option.isSome(current)
      ? Effect.succeed(current.value.space)
      : Effect.fail(
          new Store.Failure({
            operation: "transaction",
            cause: "Missing, closed, or foreign workspace transaction",
          }),
        ),
  );
  const join = Effect.map(session, (current) =>
    Option.isSome(current) ? current.value.space : MemoryDatabase.writable(database, workspaceId),
  );
  /** Take the workspace's writer, which this host's writers wait for and another host's refuse. */
  const acquire = Effect.fnUntraced(function* (
    restore: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>,
  ) {
    yield* restore(gate.take(1));
    if (database.writers.has(workspaceId)) {
      yield* gate.release(1);
      return yield* new Store.Conflict({
        operation: "transaction",
        message: "Another host is writing this workspace",
      });
    }
    database.writers.set(workspaceId, memoryConnection);
  });
  const release = Effect.suspend(() => {
    database.writers.delete(workspaceId);
    return gate.release(1);
  });
  const exclusive: Binding["Service"]["exclusive"] = (write) =>
    Effect.flatMap(session, (current) =>
      Option.isSome(current)
        ? write(current.value.space)
        : Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              yield* acquire(restore);
              const exit = yield* Effect.exit(
                restore(write(MemoryDatabase.writable(database, workspaceId))),
              );
              yield* release;
              return yield* exit;
            }),
          ),
    );

  const transaction: Binding["Service"]["transaction"] = Effect.fn("Binding.transaction")(
    function* <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: TransactionState) => TransactionHandle,
      options: { readonly workspace?: boolean } = {},
    ) {
      const exclusive = options.workspace !== false;
      yield* read;
      if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
        return yield* new Store.Failure({
          operation: "transaction",
          cause: "Native transactions cannot nest; use journal.commit",
        });
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          // This host's writers wait for each other; another host's writer is contention.
          if (exclusive) yield* acquire(restore);
          const state: TransactionState = {
            connection: memoryConnection,
            workspaceId,
            active: true,
            commit: {
              id: Commit.Id.make(database.nextId("commit")),
              recordedAt: yield* DateTime.now,
              entryCount: 0,
            },
            space: MemoryDatabase.copy(MemoryDatabase.committed(database, workspaceId)),
            held: new Set(),
            afterCommit: [],
          };
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, CurrentTransaction, state),
                ),
                Effect.provideService(Store.Transaction, native(state)),
              ),
            ),
          );
          state.active = false;
          // Committing makes the snapshot of what it wrote committed; rolling back drops it.
          if (Exit.isSuccess(exit)) {
            MemoryDatabase.commit(database, workspaceId, state.space, {
              logs: state.held,
              workspace: exclusive,
            });
            if ((state.space.commits.get(state.commit.id)?.entryCount ?? 0) > 0)
              MemoryDatabase.wakeAppendReaders(database);
          }
          for (const logId of state.held)
            yield* MemoryDatabase.logLock(database, workspaceId, logId).release(1);
          if (exclusive) yield* release;
          if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
          // Committed, with the workspace and its logs released.
          yield* Store.runAfterCommit(state.afterCommit);
          return exit.value;
        }),
      );
    },
  );

  return Binding.of({
    workspaceId,
    connection: memoryConnection,
    read,
    write,
    join,
    exclusive,
    transaction,
  });
});

/**
 * The binding of one workspace, over the caller's `MemoryConnection`.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (workspaceId: Workspace.Id) => Layer.effect(Binding, make(workspaceId));
