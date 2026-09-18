/**
 * One workspace's view of the database: its identity, the transaction boundary
 * every commit runs inside, and the guard every store applies to its
 * statements. Store modules require this service and nothing else of each other.
 */
import { Commit, Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Cause, Context, DateTime, Effect, Exit, Layer, Option } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { SqliteDatabase } from "./database.ts";
import { isContention } from "./errors.ts";

/** The native handle a session exposes to core. */
export type TransactionHandle = Context.Service.Shape<typeof Store.Transaction>;

/** One open native transaction, closed when its program ends. */
export interface TransactionState {
  readonly owner: SqliteDatabase.Interface;
  readonly workspaceId: Workspace.Id;
  readonly commit: Commit.Record;
  active: boolean;
}

/** The session a program runs under; statements check it against their own binding. */
export class CurrentTransaction extends Context.Service<CurrentTransaction, TransactionState>()(
  "@amends/storage-sqlite/binding/Current",
) {}

export interface Interface {
  readonly workspaceId: Workspace.Id;
  readonly database: SqliteDatabase.Interface;
  /**
   * Run a statement outside any transaction, or inside a live transaction of
   * this workspace on this database; anything else is a foreign or expired
   * handle. Writes additionally require a transaction.
   */
  readonly guard: <A, E, R>(
    program: Effect.Effect<A, E, R>,
    write?: boolean,
  ) => Effect.Effect<A, E | Store.Failure, R>;
  /**
   * The store's transaction primitive, given how to expose the native handle
   * for the session it opens. See Store.Interface for the contract.
   */
  readonly transaction: <A, E, R>(
    program: Effect.Effect<A, E, R>,
    native: (session: TransactionState) => TransactionHandle,
  ) => Effect.Effect<
    A,
    E | Store.Failure | Store.Conflict | Store.CommitUncertain,
    Exclude<R, Store.Transaction>
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-sqlite/binding/Service",
) {}

/** Contention is a conflict the caller may retry; anything else failed the transaction. */
const transactionError = (cause: SqlError.SqlError) =>
  isContention(cause)
    ? new Store.Conflict({ operation: "transaction", message: cause.message })
    : new Store.Failure({ operation: "transaction", cause });

/**
 * Construct one workspace binding over the caller's database; transactions are resolved per operation.
 *
 * @category constructors
 */
export const make = Effect.fn("Binding.make")(function* (workspaceId: Workspace.Id) {
  const database = yield* SqliteDatabase.Service;
  const { sql, health } = database;

  const check = Effect.fnUntraced(function* (write: boolean) {
    if (health.broken)
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Connection requires reopening after a failed transaction cleanup",
      });
    const current = yield* Effect.serviceOption(CurrentTransaction);
    const native = yield* Effect.serviceOption(Store.Transaction);
    const connection = yield* Effect.serviceOption(sql.transactionService);
    if (Option.isNone(current) && Option.isNone(native) && Option.isNone(connection) && !write)
      return;
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      Option.isNone(connection) ||
      !current.value.active ||
      current.value.owner !== database ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    ) {
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Missing, closed, or foreign workspace transaction",
      });
    }
  });
  const guard: Interface["guard"] = (program, write = false) =>
    check(write).pipe(Effect.andThen(program));

  const transaction: Interface["transaction"] = Effect.fn("Binding.transaction")(function* <
    A,
    E,
    R,
  >(program: Effect.Effect<A, E, R>, native: (session: TransactionState) => TransactionHandle) {
    yield* check(false);
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Native transactions cannot nest; use journal.commit",
      });
    const session: TransactionState = {
      owner: database,
      workspaceId,
      active: true,
      commit: {
        id: Commit.Id.make(crypto.randomUUID()),
        recordedAt: yield* DateTime.now,
        entryCount: 0,
      },
    };
    const handle = native(session);
    // Reserve the driver's connection, but own the commit boundary: the generic
    // SqlClient wrapper turns COMMIT errors into defects and cannot report CommitUncertain.
    return yield* Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const connection = yield* restore(sql.reserve).pipe(Effect.mapError(transactionError));
          const control = (statement: string) =>
            connection.executeUnprepared(statement, [], undefined);
          yield* control("BEGIN IMMEDIATE").pipe(Effect.mapError(transactionError));
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, CurrentTransaction, session),
                ),
                Effect.provideService(Store.Transaction, handle),
                Effect.provideService(sql.transactionService, [connection, 0]),
              ),
            ),
          );
          session.active = false;
          if (Exit.isFailure(exit)) {
            const rollback = yield* Effect.exit(control("ROLLBACK"));
            if (Exit.isFailure(rollback)) {
              health.broken = true;
              return yield* Effect.failCause(
                Cause.combine(
                  exit.cause,
                  Cause.fail(new Store.Failure({ operation: "rollback", cause: rollback.cause })),
                ),
              );
            }
            return yield* Effect.failCause(exit.cause);
          }
          const commit = yield* Effect.exit(control("COMMIT"));
          if (Exit.isFailure(commit)) {
            const rollback = yield* Effect.exit(control("ROLLBACK"));
            if (Exit.isFailure(rollback)) health.broken = true;
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: commit.cause,
            });
          }
          return exit.value;
        }),
      ),
    );
  });

  return Service.of({ workspaceId, database, guard, transaction });
});

/**
 * Provide Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = (workspaceId: Workspace.Id) => Layer.effect(Service, make(workspaceId));

export * as Binding from "./binding.ts";
