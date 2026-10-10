/**
 * One workspace's view of memory storage: its identity, the transaction boundary every commit
 * runs inside, and the state each statement sees. Store modules require this service and
 * nothing else of each other.
 */
import { Commit, Store } from "@amends-dev/core/journal";
import type { Workspace } from "@amends-dev/core/workspace";
import { Context, DateTime, Effect, Exit, Layer, Option } from "effect";
import { MemoryConnection } from "./connection.ts";
import { MemoryDatabase } from "./database.ts";

/** The native handle a session exposes to core. */
export type TransactionHandle = Context.Service.Shape<typeof Store.Transaction>;

/** One open transaction: a snapshot of the workspace that its writes change until it commits. */
export interface TransactionState {
  readonly connection: MemoryConnection.Interface;
  readonly workspaceId: Workspace.Id;
  readonly commit: Commit.Record;
  readonly space: MemoryDatabase.Space;
  /** Logs this transaction holds against their other writers, released when it ends. */
  readonly held: Set<string>;
  /** What `afterCommit` asked to run once the transaction commits, in order. */
  readonly afterCommit: Array<Effect.Effect<void>>;
  active: boolean;
}

/** Ask for `effect` to run once the session's transaction commits; a closed session's handle is expired. */
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

/** The session a program runs under; statements check it against their own binding. */
export class CurrentTransaction extends Context.Service<CurrentTransaction, TransactionState>()(
  "@amends-dev/storage-memory/binding/Current",
) {}

export interface Interface {
  readonly workspaceId: Workspace.Id;
  readonly connection: MemoryConnection.Interface;
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
   * it opens. See Store.Interface for the contract. With `workspace: false` it does not take the
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

export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/storage-memory/binding/Service",
) {}

/**
 * Construct one workspace binding over the caller's connection.
 *
 * @category constructors
 */
export const make = Effect.fn("Binding.make")(function* (workspaceId: Workspace.Id) {
  const memoryConnection = yield* MemoryConnection.Service;
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
  const exclusive: Interface["exclusive"] = (write) =>
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

  const transaction: Interface["transaction"] = Effect.fn("Binding.transaction")(function* <
    A,
    E,
    R,
  >(
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
  });

  return Service.of({
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
 * Provide Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = (workspaceId: Workspace.Id) => Layer.effect(Service, make(workspaceId));

export * as Binding from "./binding.ts";
