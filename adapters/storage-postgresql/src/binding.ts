/**
 * One workspace's view of the database: its identity, the transaction boundary
 * every commit runs inside, and the guard every store applies to its
 * statements. Store modules require this service and nothing else of each other.
 */
import { Commit, Store } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import { Cause, Context, DateTime, Duration, Effect, Exit, Layer, Option, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql";
import { PostgresDatabase } from "./database.ts";
import { isContention } from "./errors.ts";

export interface Options {
  /**
   * How long a transaction waits for the workspace's writer lock before it
   * reports contention. Writers to one workspace run one at a time.
   */
  readonly lockTimeout?: Duration.Input | undefined;
  /** How often a waiting reader re-checks the log for committed batches. */
  readonly pollInterval?: Duration.Input | undefined;
}

/** The native handle a session exposes to core. */
export type Native = Context.Service.Shape<typeof Store.Transaction>;

/** One open native transaction, closed when its program ends. */
export interface Session {
  readonly owner: PostgresDatabase.Database;
  readonly workspaceId: Workspace.Id;
  readonly commit: Commit.Record;
  active: boolean;
}

/** The session a program runs under; statements check it against their own binding. */
export class Current extends Context.Service<Current, Session>()(
  "@amends/storage-postgresql/binding/Current",
) {}

export interface Interface {
  readonly workspaceId: Workspace.Id;
  readonly database: PostgresDatabase.Database;
  readonly pollInterval: Duration.Duration;
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
    native: (session: Session) => Native,
  ) => Effect.Effect<
    A,
    E | Store.Failure | Store.Conflict | Store.CommitUncertain,
    Exclude<R, Store.Transaction>
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/storage-postgresql/binding/Service",
) {}

/** Contention is a conflict the caller may retry; anything else failed the transaction. */
const transactionError = (cause: SqlError.SqlError) =>
  isContention(cause)
    ? new Store.Conflict({ operation: "transaction", message: cause.message })
    : new Store.Failure({ operation: "transaction", cause });

/** What the client reports for a control statement; the tag says what PostgreSQL actually did. */
const isCommitted = Schema.is(Schema.Struct({ command: Schema.Literal("COMMIT") }));

export const make = Effect.fn("Binding.make")(function* (
  workspaceId: Workspace.Id,
  options: Options = {},
) {
  const database = yield* PostgresDatabase.Service;
  const { sql } = database;
  const lockTimeout = Duration.fromInputUnsafe(options.lockTimeout ?? Duration.seconds(5));
  const pollInterval = Duration.fromInputUnsafe(options.pollInterval ?? "100 millis");

  const check = Effect.fnUntraced(function* (write: boolean) {
    const current = yield* Effect.serviceOption(Current);
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
  >(program: Effect.Effect<A, E, R>, native: (session: Session) => Native) {
    yield* check(false);
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Native transactions cannot nest; use journal.commit",
      });
    const session: Session = {
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
    // Reserve a pooled connection, but own the commit boundary: the generic
    // SqlClient wrapper turns COMMIT errors into defects and cannot report CommitUncertain.
    return yield* Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const connection = yield* restore(sql.reserve).pipe(Effect.mapError(transactionError));
          const control = (statement: string, params: ReadonlyArray<unknown> = []) =>
            connection.executeUnprepared(statement, params, undefined);
          yield* control("BEGIN").pipe(Effect.mapError(transactionError));
          // Writers to one workspace take turns, so positions and checkpoints
          // serialize without serializable isolation. A workspace's key is a
          // hash of its ID; a collision only over-serializes.
          const locked = yield* Effect.exit(
            control(`SET LOCAL lock_timeout = ${Math.ceil(Duration.toMillis(lockTimeout))}`).pipe(
              Effect.andThen(
                control("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [workspaceId]),
              ),
            ),
          );
          if (Exit.isFailure(locked)) {
            yield* Effect.ignore(control("ROLLBACK"));
            return yield* Effect.failCause(Cause.map(locked.cause, transactionError));
          }
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, Current, session),
                ),
                Effect.provideService(Store.Transaction, handle),
                Effect.provideService(sql.transactionService, [connection, 0]),
              ),
            ),
          );
          session.active = false;
          if (Exit.isFailure(exit)) {
            // A connection that cannot roll back is dropped by the pool on its
            // socket error; the failure below is the outcome callers see.
            const rollback = yield* Effect.exit(control("ROLLBACK"));
            if (Exit.isFailure(rollback))
              return yield* Effect.failCause(
                Cause.combine(
                  exit.cause,
                  Cause.fail(new Store.Failure({ operation: "rollback", cause: rollback.cause })),
                ),
              );
            return yield* Effect.failCause(exit.cause);
          }
          const commit = yield* Effect.exit(connection.executeRaw("COMMIT", []));
          if (Exit.isFailure(commit)) {
            yield* Effect.ignore(control("ROLLBACK"));
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: commit.cause,
            });
          }
          // A statement that failed earlier aborted the transaction, and the
          // program went on regardless: PostgreSQL answers COMMIT with a
          // rollback rather than an error, which must not pass for success.
          if (!isCommitted(commit.value))
            return yield* new Store.Failure({
              operation: "commit",
              cause: "An earlier failed statement aborted the transaction; nothing was committed",
            });
          return exit.value;
        }),
      ),
    );
  });

  return Service.of({ workspaceId, database, pollInterval, guard, transaction });
});

export const layer = (workspaceId: Workspace.Id, options: Options = {}) =>
  Layer.effect(Service, make(workspaceId, options));

export * as Binding from "./binding.ts";
