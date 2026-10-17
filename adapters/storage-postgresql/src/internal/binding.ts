/**
 * One workspace's view of the database: its identity, the transaction boundary every commit runs
 * inside, and the guard every store applies to its statements. `PostgresWorkspaceStorage` builds
 * one for each workspace over the shared `PostgresDatabase.PostgresDatabase`, and each store module
 * requires this service and nothing else of the others. A transaction waits its turn behind this
 * process's other writers to the workspace in `PostgresTurns`, then for a pooled connection and the
 * workspace's advisory lock, all within `lockTimeout`; a standalone append waits for its log's
 * writers instead. `Journal` builds the journal's transactions and standalone appends on it.
 */

import type { WorkspaceId } from "@amends-dev/core/workspace"
import { Commit, Store, type Entry, StoreError } from "@amends-dev/log"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as SqlError from "effect/sql/SqlError"
import * as PostgresDatabase from "../PostgresDatabase.ts"
import * as PostgresNotices from "../PostgresNotices.ts"
import { isContention } from "./errors.ts"

/**
 * The host's limits on a workspace's transactions and on its statements outside them, each with a
 * default. `PostgresStorage.layer` takes them, and `settings` checks them when the host starts.
 */
export interface Options {
  /**
   * How long a transaction waits for its turn to write before it reports contention: behind this
   * process's other writers to the workspace, for a pooled connection, and for the workspace's
   * lock in PostgreSQL, altogether. Writers to one workspace run one at a time. Five seconds by
   * default.
   */
  readonly lockTimeout?: Duration.Input | undefined
  /**
   * How long one statement inside a transaction may run, at least the lock timeout, since taking
   * the lock is a statement. Ten seconds by default.
   */
  readonly statementTimeout?: Duration.Input | undefined
  /**
   * How long a transaction's program may run once it holds its lock before it rolls back.
   * PostgreSQL also ends a session left idle inside a transaction for twice this long, so a
   * process that stalls cannot keep the workspace's lock, while a live one always rolls back
   * first and never has its connection ended under it. Thirty seconds by default.
   */
  readonly transactionTimeout?: Duration.Input | undefined
  /**
   * How often a waiting reader re-checks the log without a notification: the fallback when a
   * notification is lost or `LISTEN` is unavailable, as behind a transaction-pooling proxy. Five
   * seconds by default.
   */
  readonly pollInterval?: Duration.Input | undefined
  /**
   * The most pooled connections this process's statements for one workspace use at once outside
   * its transactions, so one busy workspace leaves the rest of the pool to others. Three by
   * default.
   */
  readonly readConnections?: number | undefined
}

/**
 * The options with their defaults applied, each duration a whole number of milliseconds.
 */
export interface Settings {
  readonly lockTimeout: Duration.Duration
  readonly statementTimeout: Duration.Duration
  readonly transactionTimeout: Duration.Duration
  readonly pollInterval: Duration.Duration
  readonly readConnections: number
}

/**
 * Apply the defaults and check the options, dying on any out of range. PostgreSQL reads a timeout
 * of zero as none, so every duration must be finite and at least a millisecond, and the statement
 * timeout at least the lock timeout, since taking the lock is a statement.
 */
export const settings = (options: Options = {}): Effect.Effect<Settings> =>
  Effect.gen(function* () {
    const resolve = (name: string, input: Duration.Input | undefined, fallback: Duration.Input) =>
      Effect.suspend(() => {
        const millis = Math.ceil(Duration.toMillis(Duration.fromInputUnsafe(input ?? fallback)))
        return Number.isSafeInteger(millis) && millis >= 1
          ? Effect.succeed(Duration.millis(millis))
          : Effect.die(new Error(`${name} must be a finite duration of at least a millisecond`))
      })
    const resolved = {
      lockTimeout: yield* resolve("lockTimeout", options.lockTimeout, "5 seconds"),
      statementTimeout: yield* resolve("statementTimeout", options.statementTimeout, "10 seconds"),
      transactionTimeout: yield* resolve("transactionTimeout", options.transactionTimeout, "30 seconds"),
      pollInterval: yield* resolve("pollInterval", options.pollInterval, "5 seconds"),
      readConnections: options.readConnections ?? 3
    }
    if (!Number.isSafeInteger(resolved.readConnections) || resolved.readConnections < 1)
      return yield* Effect.die(new Error("readConnections must be a whole number of at least 1"))
    if (Duration.isLessThan(resolved.statementTimeout, resolved.lockTimeout))
      return yield* Effect.die(new Error("statementTimeout must be at least lockTimeout"))
    return resolved
  })

/**
 * The `Store.Transaction` handle a session gives its program: the commit's ID, its appends, and
 * `afterCommit`. `Journal` builds one for each session the binding opens.
 */
export type TransactionHandle = Context.Service.Shape<typeof Store.Transaction>

/**
 * One open native transaction, closed when its program ends: what `CurrentTransaction` holds while
 * the program runs, and what `Journal` stages its appends against.
 */
export interface TransactionState {
  /** The database the transaction runs on; a binding over another database refuses it. */
  readonly owner: PostgresDatabase.PostgresDatabase["Service"]
  readonly workspaceId: WorkspaceId.WorkspaceId
  /** The commit the transaction records, timed once the writer's turn has come. */
  readonly commit: Commit.Commit
  /** False once the program ends, after which a handle to the transaction is expired. */
  active: boolean
  /** Writes the transaction staged in memory, run after its program and before COMMIT. */
  beforeCommit: Effect.Effect<void, StoreError.StoreError>
  /**
   * Notices to send on `PostgresNotices.channel` once COMMIT succeeds, each once. Notifying inside
   * the transaction would hold PostgreSQL's notification lock through the commit's WAL flush,
   * making every notifying commit on the server wait for the one before it.
   */
  readonly notices: Set<string>
  /** What `afterCommit` asked to run once the transaction commits, in order. */
  readonly afterCommit: Array<Effect.Effect<void>>
}

/**
 * Ask for `effect` to run once the session's transaction commits, as `Store.Transaction`'s
 * `afterCommit` does; a closed session's handle is expired.
 */
export const afterCommit = (session: TransactionState, effect: Effect.Effect<void>) =>
  Effect.suspend(() => {
    if (!session.active)
      return Effect.fail(StoreError.failed("Store", "afterCommit")("Missing, closed, or foreign workspace transaction"))
    session.afterCommit.push(effect)
    return Effect.void
  })

/**
 * The session a program runs under; statements check it against their own binding.
 */
export class CurrentTransaction extends Context.Service<CurrentTransaction, TransactionState>()(
  "@amends-dev/storage-postgresql/internal/binding/CurrentTransaction"
) {}

/**
 * One workspace's view of the database, which every store module in this adapter is built over.
 * `make` builds it for a workspace, and `layer` provides it to the stores
 * `PostgresWorkspaceStorage.layerWorkspace` merges.
 */
export class Binding extends Context.Service<
  Binding,
  {
    /** The workspace every statement through the binding is scoped to. */
    readonly workspaceId: WorkspaceId.WorkspaceId
    /** The connected database, shared by every workspace's binding in the process. */
    readonly database: PostgresDatabase.PostgresDatabase["Service"]
    /** How often a reader waiting for an append checks again without a notification. */
    readonly pollInterval: Duration.Duration
    /**
     * Run a statement outside any transaction, or inside a live transaction of this workspace on
     * this database; anything else is a foreign or expired handle. Writes additionally require a
     * transaction. Outside one, a statement takes its own pooled connection, within the
     * workspace's `readConnections`.
     */
    readonly guard: <A, E, R>(
      program: Effect.Effect<A, E, R>,
      write?: boolean
    ) => Effect.Effect<A, E | StoreError.StoreError, R>
    /**
     * The store's transaction primitive, given how to expose the native handle
     * for the session it opens. See `Store.Store` for the contract. With `log`
     * it skips the workspace's writer lock, for a standalone append that locks only
     * that log, and takes turns with this process's other appends to it.
     */
    readonly transaction: <A, E, R>(
      program: Effect.Effect<A, E, R>,
      native: (session: TransactionState) => TransactionHandle,
      options?: { readonly log?: Entry.LogId }
    ) => Effect.Effect<A, E | StoreError.StoreError | Store.CommitUncertain, Exclude<R, Store.Transaction>>
  }
>()("@amends-dev/storage-postgresql/internal/binding") {}

/** Contention is worth retrying; anything else failed the transaction. */
const transactionError = (cause: SqlError.SqlError) =>
  isContention(cause)
    ? StoreError.contended("Store", "transaction", cause.message)
    : StoreError.failed("Store", "transaction")(cause)

/** What the client reports for a control statement; the tag says what PostgreSQL actually did. */
const isCommitted = Schema.is(Schema.Struct({ command: Schema.Literal("COMMIT") }))

/**
 * Construct one workspace binding over the caller's database, naming each commit with the
 * caller's `Crypto.Crypto`; transactions are resolved per operation. Dies on options `settings`
 * refuses.
 */
export const make = Effect.fnUntraced(function* (workspaceId: WorkspaceId.WorkspaceId, options: Options = {}) {
  const postgresDatabase = yield* PostgresDatabase.PostgresDatabase
  const crypto = yield* Crypto.Crypto
  const { sql, turns, reads } = postgresDatabase
  const { lockTimeout, statementTimeout, transactionTimeout, pollInterval, readConnections } = yield* settings(options)
  const lockMillis = Duration.toMillis(lockTimeout)
  /** Session settings for one transaction: they end with it, whether it commits or not. */
  const limits = [String(Duration.toMillis(statementTimeout)), String(2 * Duration.toMillis(transactionTimeout))]

  const check = Effect.fnUntraced(function* (write: boolean) {
    const current = yield* Effect.serviceOption(CurrentTransaction)
    const native = yield* Effect.serviceOption(Store.Transaction)
    const connection = yield* Effect.serviceOption(sql.transactionService)
    if (Option.isNone(current) && Option.isNone(native) && Option.isNone(connection) && !write) return
    if (
      Option.isNone(current) ||
      Option.isNone(native) ||
      Option.isNone(connection) ||
      !current.value.active ||
      current.value.owner !== postgresDatabase ||
      current.value.workspaceId !== workspaceId ||
      current.value.commit.id !== native.value.id
    ) {
      return yield* StoreError.failed("Store", "transaction")("Missing, closed, or foreign workspace transaction")
    }
  })
  const readKey = JSON.stringify(["reads", workspaceId])
  // Outside a transaction a statement takes its own pooled connection, within the workspace's cap.
  const guard: Binding["Service"]["guard"] = (program, write = false) =>
    check(write).pipe(
      Effect.andThen(Effect.serviceOption(CurrentTransaction)),
      Effect.flatMap((current) => (Option.isSome(current) ? program : reads.run(readKey, readConnections, program)))
    )

  const transaction: Binding["Service"]["transaction"] = Effect.fn("Binding.transaction")(function* <A, E, R>(
    program: Effect.Effect<A, E, R>,
    native: (session: TransactionState) => TransactionHandle,
    options: { readonly log?: Entry.LogId } = {}
  ) {
    yield* check(false)
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* StoreError.failed("Store", "transaction")("Native transactions cannot nest; use journal.commit")
    const commitId = Commit.CommitId.make(
      yield* crypto.randomUUIDv4().pipe(Effect.mapError(StoreError.failed("Store", "transaction")))
    )
    const standalone = options.log !== undefined
    const held = standalone ? "log" : "workspace"
    const committed: Array<Effect.Effect<void>> = []
    const busy = (waitingFor: string) =>
      StoreError.contended("Store", "transaction", `Waited longer than the lock timeout for ${waitingFor}`)
    // Waiting in this process's queue, for a connection, and for the lock share one budget.
    const began = yield* Clock.currentTimeMillis
    const remaining = Effect.map(Clock.currentTimeMillis, (now) => Math.max(1, Math.ceil(lockMillis - (now - began))))
    // Reserve a pooled connection, but own the commit boundary: the generic
    // SqlClient wrapper turns COMMIT errors into defects and cannot report CommitUncertain.
    const run = Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const reserved = yield* restore(sql.reserve).pipe(
            Effect.timeoutOption(Duration.millis(yield* remaining)),
            Effect.mapError(transactionError)
          )
          if (Option.isNone(reserved)) return yield* busy("a database connection")
          const connection = reserved.value
          const control = (statement: string, params: ReadonlyArray<unknown> = []) =>
            connection.executeUnprepared(statement, params, undefined)
          yield* control("BEGIN").pipe(Effect.mapError(transactionError))
          // Writers to one workspace take turns, so projections and checkpoints
          // serialize without serializable isolation. A workspace's key is a
          // hash of its ID; a collision only over-serializes. The lock timeout also
          // bounds waiting for a log's lock, and the idle timeout ends the session,
          // releasing its locks, if the process stops sending statements.
          const limited = control(
            "SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true), set_config('idle_in_transaction_session_timeout', $3, true)",
            [String(yield* remaining), ...limits]
          )
          const locked = yield* Effect.exit(
            standalone
              ? limited
              : limited.pipe(
                  Effect.andThen(control("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [workspaceId]))
                )
          )
          if (Exit.isFailure(locked)) {
            yield* Effect.ignore(control("ROLLBACK"))
            return yield* Effect.failCause(Cause.map(locked.cause, transactionError))
          }
          // Recorded once the writer holds the workspace, so commit times follow their order.
          const session: TransactionState = {
            owner: postgresDatabase,
            workspaceId,
            active: true,
            commit: {
              id: commitId,
              recordedAt: yield* DateTime.now,
              entryCount: 0
            },
            beforeCommit: Effect.void,
            notices: new Set(),
            afterCommit: committed
          }
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                // Staged writes land inside the transaction, with the program's services.
                Effect.tap(() => Effect.suspend(() => session.beforeCommit)),
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, CurrentTransaction, session)
                ),
                Effect.provideService(Store.Transaction, native(session)),
                Effect.provideService(sql.transactionService, [connection, 0]),
                Effect.timeoutOrElse({
                  duration: transactionTimeout,
                  orElse: () =>
                    Effect.fail(
                      new StoreError.StoreError({
                        store: "Store",
                        operation: "transaction",
                        reason: new StoreError.Failed({
                          cause: `The transaction ran longer than ${Duration.format(transactionTimeout)}`
                        })
                      })
                    )
                })
              )
            )
          )
          session.active = false
          if (Exit.isFailure(exit)) {
            // A connection that cannot roll back is dropped by the pool on its
            // socket error; the failure below is the outcome callers see.
            const rollback = yield* Effect.exit(control("ROLLBACK"))
            if (Exit.isFailure(rollback))
              return yield* Effect.failCause(
                Cause.combine(exit.cause, Cause.fail(StoreError.failed("Store", "rollback")(rollback.cause)))
              )
            return yield* Effect.failCause(exit.cause)
          }
          const commit = yield* Effect.exit(connection.executeRaw("COMMIT", []))
          if (Exit.isFailure(commit)) {
            yield* Effect.ignore(control("ROLLBACK"))
            return yield* new Store.CommitUncertain({
              commitId: session.commit.id,
              cause: commit.cause
            })
          }
          // A statement that failed earlier aborted the transaction, and the
          // program went on regardless: PostgreSQL answers COMMIT with a
          // rollback rather than an error, which must not pass for success.
          if (!isCommitted(commit.value))
            return yield* new StoreError.StoreError({
              store: "Store",
              operation: "commit",
              reason: new StoreError.Failed({
                cause: "An earlier failed statement aborted the transaction; nothing was committed"
              })
            })
          // Committed: tell waiting readers in every process, in one statement of its own. A notice
          // lost to a failure here leaves them to find the commit at their next poll.
          if (session.notices.size > 0)
            yield* control("SELECT pg_notify($1, notice) FROM unnest($2::text[]) AS notice", [
              PostgresNotices.channel,
              [...session.notices]
            ]).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Commit notice not sent; readers will find it by polling", cause)
              )
            )
          return exit.value
        })
      )
    )
    // This process's writers to the workspace, or to a standalone append's log, queue here, so
    // only the one at the front holds a connection while PostgreSQL makes it wait for the lock.
    const result = yield* turns.run(
      JSON.stringify(standalone ? [workspaceId, options.log] : [workspaceId]),
      lockTimeout,
      () => busy(`this process's other writers to the ${held}`),
      run
    )
    // Committed, with its connection back in the pool and the next writer free to go.
    yield* Store.runAfterCommit(committed)
    return result
  })

  return Binding.of({ workspaceId, database: postgresDatabase, pollInterval, guard, transaction })
})

/**
 * Provides the binding for one workspace over the caller's `PostgresDatabase.PostgresDatabase`.
 */
export const layer = (workspaceId: WorkspaceId.WorkspaceId, options: Options = {}) =>
  Layer.effect(Binding, make(workspaceId, options))
