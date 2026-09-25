/**
 * One workspace's view of the database: its identity, the transaction boundary
 * every commit runs inside, and the guard every store applies to its
 * statements. Store modules require this service and nothing else of each other.
 */
import { Commit, Store } from "@amends/core/journal";
import type { Entry } from "@amends/core/journal";
import type { Workspace } from "@amends/core/workspace";
import {
  Cause,
  Clock,
  Context,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
} from "effect";
import type { SqlError } from "effect/unstable/sql";
import { PostgresDatabase } from "./database.ts";
import { isContention } from "./errors.ts";

export interface Options {
  /**
   * How long a transaction waits for its turn to write before it reports contention: behind this
   * process's other writers to the workspace, for a pooled connection, and for the workspace's
   * lock in PostgreSQL, altogether. Writers to one workspace run one at a time. Five seconds by
   * default.
   */
  readonly lockTimeout?: Duration.Input | undefined;
  /**
   * How long one statement inside a transaction may run, at least the lock timeout, since taking
   * the lock is a statement. Ten seconds by default.
   */
  readonly statementTimeout?: Duration.Input | undefined;
  /**
   * How long a transaction's program may run once it holds its lock before it rolls back.
   * PostgreSQL also ends a session left idle inside a transaction for twice this long, so a
   * process that stalls cannot keep the workspace's lock, while a live one always rolls back
   * first and never has its connection ended under it. Thirty seconds by default.
   */
  readonly transactionTimeout?: Duration.Input | undefined;
  /**
   * How often a waiting reader re-checks the log without a notification: the fallback when a
   * notification is lost or `LISTEN` is unavailable, as behind a transaction-pooling proxy.
   */
  readonly pollInterval?: Duration.Input | undefined;
  /**
   * The most pooled connections this process's statements for one workspace use at once outside
   * its transactions, so one busy workspace leaves the rest of the pool to others. Three by
   * default.
   */
  readonly readConnections?: number | undefined;
}

/** Options with their defaults, each a whole number of milliseconds. */
export interface Settings {
  readonly lockTimeout: Duration.Duration;
  readonly statementTimeout: Duration.Duration;
  readonly transactionTimeout: Duration.Duration;
  readonly pollInterval: Duration.Duration;
  readonly readConnections: number;
}

/**
 * Apply the defaults and check the options. PostgreSQL reads a timeout of zero as none, so every
 * duration must be finite and at least a millisecond.
 */
export const settings = (options: Options = {}): Effect.Effect<Settings> =>
  Effect.gen(function* () {
    const resolve = (name: string, input: Duration.Input | undefined, fallback: Duration.Input) =>
      Effect.suspend(() => {
        const millis = Math.ceil(Duration.toMillis(Duration.fromInputUnsafe(input ?? fallback)));
        return Number.isSafeInteger(millis) && millis >= 1
          ? Effect.succeed(Duration.millis(millis))
          : Effect.die(new Error(`${name} must be a finite duration of at least a millisecond`));
      });
    const resolved = {
      lockTimeout: yield* resolve("lockTimeout", options.lockTimeout, "5 seconds"),
      statementTimeout: yield* resolve("statementTimeout", options.statementTimeout, "10 seconds"),
      transactionTimeout: yield* resolve(
        "transactionTimeout",
        options.transactionTimeout,
        "30 seconds",
      ),
      pollInterval: yield* resolve("pollInterval", options.pollInterval, "5 seconds"),
      readConnections: options.readConnections ?? 3,
    };
    if (!Number.isSafeInteger(resolved.readConnections) || resolved.readConnections < 1)
      return yield* Effect.die(new Error("readConnections must be a whole number of at least 1"));
    if (Duration.isLessThan(resolved.statementTimeout, resolved.lockTimeout))
      return yield* Effect.die(new Error("statementTimeout must be at least lockTimeout"));
    return resolved;
  });

/** The native handle a session exposes to core. */
export type TransactionHandle = Context.Service.Shape<typeof Store.Transaction>;

/** One open native transaction, closed when its program ends. */
export interface TransactionState {
  readonly owner: PostgresDatabase.Interface;
  readonly workspaceId: Workspace.Id;
  readonly commit: Commit.Record;
  active: boolean;
  /** Writes the transaction staged in memory, run after its program and before COMMIT. */
  beforeCommit: Effect.Effect<void, Store.Failure | Store.Conflict>;
}

/** The session a program runs under; statements check it against their own binding. */
export class CurrentTransaction extends Context.Service<CurrentTransaction, TransactionState>()(
  "@amends/storage-postgresql/binding/Current",
) {}

export interface Interface {
  readonly workspaceId: Workspace.Id;
  readonly database: PostgresDatabase.Interface;
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
   * for the session it opens. See Store.Interface for the contract. With `log`
   * it skips the workspace's writer lock, for a standalone append that locks only
   * that log, and takes turns with this process's other appends to it.
   */
  readonly transaction: <A, E, R>(
    program: Effect.Effect<A, E, R>,
    native: (session: TransactionState) => TransactionHandle,
    options?: { readonly log?: Entry.LogId },
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

/**
 * Construct one workspace binding over the caller's database; transactions are resolved per operation.
 *
 * @category constructors
 */
export const make = Effect.fn("Binding.make")(function* (
  workspaceId: Workspace.Id,
  options: Options = {},
) {
  const database = yield* PostgresDatabase.Service;
  const { sql, turns, reads } = database;
  const { lockTimeout, statementTimeout, transactionTimeout, pollInterval, readConnections } =
    yield* settings(options);
  const lockMillis = Duration.toMillis(lockTimeout);
  /** Session settings for one transaction: they end with it, whether it commits or not. */
  const limits = [
    String(Duration.toMillis(statementTimeout)),
    String(2 * Duration.toMillis(transactionTimeout)),
  ];

  const check = Effect.fnUntraced(function* (write: boolean) {
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
  const readKey = JSON.stringify(["reads", workspaceId]);
  // Outside a transaction a statement takes its own pooled connection, within the workspace's cap.
  const guard: Interface["guard"] = (program, write = false) =>
    check(write).pipe(
      Effect.andThen(Effect.serviceOption(CurrentTransaction)),
      Effect.flatMap((current) =>
        Option.isSome(current) ? program : reads.run(readKey, readConnections, program),
      ),
    );

  const transaction: Interface["transaction"] = Effect.fn("Binding.transaction")(function* <
    A,
    E,
    R,
  >(
    program: Effect.Effect<A, E, R>,
    native: (session: TransactionState) => TransactionHandle,
    options: { readonly log?: Entry.LogId } = {},
  ) {
    yield* check(false);
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* new Store.Failure({
        operation: "transaction",
        cause: "Native transactions cannot nest; use journal.commit",
      });
    const standalone = options.log !== undefined;
    const held = standalone ? "log" : "workspace";
    const busy = (waitingFor: string) =>
      new Store.Conflict({
        operation: "transaction",
        message: `Waited longer than the lock timeout for ${waitingFor}`,
      });
    // Waiting in this process's queue, for a connection, and for the lock share one budget.
    const began = yield* Clock.currentTimeMillis;
    const remaining = Effect.map(Clock.currentTimeMillis, (now) =>
      Math.max(1, Math.ceil(lockMillis - (now - began))),
    );
    // Reserve a pooled connection, but own the commit boundary: the generic
    // SqlClient wrapper turns COMMIT errors into defects and cannot report CommitUncertain.
    const run = Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const reserved = yield* restore(sql.reserve).pipe(
            Effect.timeoutOption(Duration.millis(yield* remaining)),
            Effect.mapError(transactionError),
          );
          if (Option.isNone(reserved)) return yield* busy("a database connection");
          const connection = reserved.value;
          const control = (statement: string, params: ReadonlyArray<unknown> = []) =>
            connection.executeUnprepared(statement, params, undefined);
          yield* control("BEGIN").pipe(Effect.mapError(transactionError));
          // Writers to one workspace take turns, so projections and checkpoints
          // serialize without serializable isolation. A workspace's key is a
          // hash of its ID; a collision only over-serializes. The lock timeout also
          // bounds waiting for a log's lock, and the idle timeout ends the session,
          // releasing its locks, if the process stops sending statements.
          const limited = control(
            "SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true), set_config('idle_in_transaction_session_timeout', $3, true)",
            [String(yield* remaining), ...limits],
          );
          const locked = yield* Effect.exit(
            standalone
              ? limited
              : limited.pipe(
                  Effect.andThen(
                    control("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [workspaceId]),
                  ),
                ),
          );
          if (Exit.isFailure(locked)) {
            yield* Effect.ignore(control("ROLLBACK"));
            return yield* Effect.failCause(Cause.map(locked.cause, transactionError));
          }
          // Recorded once the writer holds the workspace, so commit times follow their order.
          const session: TransactionState = {
            owner: database,
            workspaceId,
            active: true,
            commit: {
              id: Commit.Id.make(crypto.randomUUID()),
              recordedAt: yield* DateTime.now,
              entryCount: 0,
            },
            beforeCommit: Effect.void,
          };
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                // Staged writes land inside the transaction, with the program's services.
                Effect.tap(() => Effect.suspend(() => session.beforeCommit)),
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, CurrentTransaction, session),
                ),
                Effect.provideService(Store.Transaction, native(session)),
                Effect.provideService(sql.transactionService, [connection, 0]),
                Effect.timeoutOrElse({
                  duration: transactionTimeout,
                  orElse: () =>
                    Effect.fail(
                      new Store.Failure({
                        operation: "transaction",
                        cause: `The transaction ran longer than ${Duration.format(transactionTimeout)}`,
                      }),
                    ),
                }),
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
    // This process's writers to the workspace, or to a standalone append's log, queue here, so
    // only the one at the front holds a connection while PostgreSQL makes it wait for the lock.
    return yield* turns.run(
      JSON.stringify(standalone ? [workspaceId, options.log] : [workspaceId]),
      lockTimeout,
      () => busy(`this process's other writers to the ${held}`),
      run,
    );
  });

  return Service.of({ workspaceId, database, pollInterval, guard, transaction });
});

/**
 * Provide Service using its constructor and the caller's dependencies.
 *
 * @category layers
 */
export const layer = (workspaceId: Workspace.Id, options: Options = {}) =>
  Layer.effect(Service, make(workspaceId, options));

export * as Binding from "./binding.ts";
