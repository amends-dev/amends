/**
 * The commit coordinator: it runs a program as one commit of the workspace's storage, and joins
 * nested commits to the one already running. `run` opens a native transaction with
 * `Store.transaction`, and inside it every write, such as a publication or a log append, runs as a
 * step through `operation`, and every read through `step`, one at a time, so that a read never
 * interleaves with writes the store has staged. A write that fails fails the whole commit, even
 * when its caller catches the failure, and once its program ends the commit closes and rejects
 * late writes. `Journal` and `Log` share one coordinator, from `Log.layer`, so their writes join
 * one commit.
 *
 * @since 0.1.0
 */

import type * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as Store from "./Store.ts"
import type * as StoreError from "./StoreError.ts"

/**
 * A write in the commit had failed, though its caller caught the failure, so the commit rolls
 * back; later writes in it fail with this too. `cause` is the first failure.
 *
 * @category errors
 * @since 0.1.0
 */
export class Aborted extends Schema.TaggedError<Aborted>()("Transaction.Aborted", {
  cause: Schema.Defect()
}) {}

/**
 * The commit had ended when a write or a nested commit tried to use it, such as from a fiber that
 * outlived it.
 *
 * @category errors
 * @since 0.1.0
 */
export class Closed extends Schema.TaggedError<Closed>()("Transaction.Closed", {}) {}

/**
 * A write reached a commit it does not belong to: one another coordinator opened, a native
 * transaction core did not open, or, for a projection, an entry of another log or commit.
 *
 * @category errors
 * @since 0.1.0
 */
export class Foreign extends Schema.TaggedError<Foreign>()("Transaction.Foreign", {}) {}

/**
 * A write was attempted where writes are forbidden, such as a projection appending to a log;
 * `reason` says which.
 *
 * @category errors
 * @since 0.1.0
 */
export class WriteForbidden extends Schema.TaggedError<WriteForbidden>()("Transaction.WriteForbidden", {
  reason: Schema.String
}) {}

/**
 * A commit's storage work began a step while another fiber's step was running. A commit runs its
 * reads and writes one at a time, so await each before the next; concurrent work in one commit is
 * a defect of the program that started it, raised as a defect and aborting the commit.
 *
 * @category errors
 * @since 0.1.0
 */
export class Concurrent extends Schema.TaggedError<Concurrent>()("Transaction.Concurrent", {}) {}

/**
 * What running a commit can fail with: storage's errors and uncertain outcomes, and
 * the coordinator's own errors.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error = StoreError.StoreError | Store.CommitUncertain | Aborted | Closed | Foreign | WriteForbidden

/**
 * What a program run as a commit still requires once the commit provides its scope and
 * `Store.Transaction`.
 *
 * @category models
 * @since 0.1.0
 */
export type Remaining<R> = Exclude<Exclude<R, Scope.Scope>, Store.Transaction>

/**
 * The commit coordinator of one workspace's storage, shared by `Log` and `Journal`. `make` builds
 * it over `Store.Store`, and `layer` provides it.
 *
 * @category services
 * @since 0.1.0
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    /** The workspace whose storage it commits to. */
    readonly workspaceId: WorkspaceId.WorkspaceId
    /**
     * Runs `program` as one commit in a native transaction, or within the current commit when
     * nested. A nested program or write that fails fails the outer commit, with `Aborted` when its
     * caller caught the failure.
     */
    readonly run: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Error, Remaining<R>>
    /**
     * Run one compound write as a step of the commit, joining or starting it. Nested steps in the
     * same fiber run within it; a step from another fiber while it runs dies with Concurrent.
     */
    readonly operation: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Error, Remaining<R>>
    /**
     * Run a read as a step of the current commit, under the same rule as operation, so it never
     * overlaps the commit's writes. Outside a commit, run it as it is; after the commit ends, the
     * store rejects its expired handle.
     */
    readonly step: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  }
>()("@amends-dev/core/journal/Transaction") {}

interface State {
  readonly owner: symbol
  readonly native: Store.Transaction["Service"]
  readonly gate: Semaphore.Semaphore
  active: boolean
  failure: Option.Option<Cause.Cause<unknown>>
}
class Current extends Context.Service<Current, State>()("@amends-dev/core/journal/Transaction/Current") {}
class OperationOwner extends Context.Service<OperationOwner, number>()(
  "@amends-dev/core/journal/Transaction/OperationOwner"
) {}
class Forbidden extends Context.Service<Forbidden, string>()("@amends-dev/core/journal/Transaction/Forbidden") {}

/**
 * Projections may update their stores, but may not append new log entries: runs `program` so that
 * appends and publications in it fail with `WriteForbidden`, giving `reason`.
 *
 * @category utils
 * @since 0.1.0
 */
export const withoutAppends = <A, E, R>(program: Effect.Effect<A, E, R>, reason: string) =>
  Effect.provideService(program, Forbidden, reason)

const recordFailure = <A, E, R>(program: Effect.Effect<A, E, R>, state: State) =>
  program.pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        if (Exit.isFailure(exit) && Option.isNone(state.failure)) state.failure = Option.some(exit.cause)
      })
    )
  )

/**
 * Construct a transaction coordinator over host storage. Each acquisition owns its commits: a
 * commit one coordinator opened cannot be joined through another.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make: Effect.Effect<Transaction["Service"], never, Store.Store> = Effect.gen(function* () {
  const store = yield* Store.Store
  const owner = Symbol("transaction coordinator")

  const run = Effect.fn("Transaction.run")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Effect.serviceOption(Current)
    if (Option.isSome(current)) {
      const state = current.value
      if (!state.active) return yield* new Closed({})
      if (state.owner !== owner) return yield* recordFailure(Effect.fail(new Foreign({})), state)
      return yield* recordFailure(
        program.pipe(Effect.scoped, Effect.provideService(Store.Transaction, state.native)),
        state
      )
    }
    // A raw host transaction cannot safely acquire a second core commit context.
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction))) return yield* new Foreign({})

    return yield* store.transaction(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const storeTransaction = yield* Store.Transaction
          const gate = yield* Semaphore.make(1)
          const state: State = {
            owner,
            native: storeTransaction,
            gate,
            active: true,
            failure: Option.none()
          }
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) => Context.add(context, Current, state)),
                Effect.scoped
              )
            )
          )
          // Drain accepted writes and fence any late use of the inherited context.
          yield* gate.withPermits(1)(
            Effect.sync(() => {
              state.active = false
            })
          )
          if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause)
          if (Option.isSome(state.failure)) return yield* new Aborted({ cause: state.failure.value })
          return exit.value
        })
      )
    )
  })

  /**
   * One step at a time: a step nested in the running one, on the same fiber, runs within it; any
   * other step while one runs is a concurrency defect rather than a wait, which could deadlock a
   * child fiber on its parent's step or interleave a read with a write the store has staged.
   */
  const runExclusively = Effect.fnUntraced(function* <A, E, R>(state: State, program: Effect.Effect<A, E, R>) {
    const fiberId = yield* Effect.fiberId
    const parent = yield* Effect.serviceOption(OperationOwner)
    if (Option.isSome(parent) && parent.value === fiberId) return yield* program
    const result = yield* state.gate.withPermitsIfAvailable(1)(Effect.provideService(program, OperationOwner, fiberId))
    if (Option.isNone(result)) return yield* recordFailure(Effect.die(new Concurrent({})), state)
    return result.value
  })

  const operation = Effect.fn("Transaction.operation")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    return yield* run(
      Effect.gen(function* () {
        const current = yield* Effect.serviceOption(Current)
        if (Option.isNone(current)) return yield* new Foreign({})
        const state = current.value
        const forbidden = yield* Effect.serviceOption(Forbidden)
        if (Option.isSome(forbidden)) return yield* new WriteForbidden({ reason: forbidden.value })
        return yield* runExclusively(
          state,
          recordFailure(
            Effect.gen(function* () {
              if (!state.active) return yield* new Closed({})
              if (Option.isSome(state.failure)) return yield* new Aborted({ cause: state.failure.value })
              return yield* program
            }),
            state
          )
        )
      })
    )
  })

  const step = Effect.fn("Transaction.step")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Effect.serviceOption(Current)
    if (Option.isNone(current) || current.value.owner !== owner || !current.value.active) return yield* program
    // A read's own failure leaves the commit as it was; only running concurrently aborts it.
    return yield* runExclusively(current.value, program)
  })

  return Transaction.of({ workspaceId: store.workspaceId, run, operation, step })
})

/**
 * Provide one transaction coordinator over host storage.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(Transaction, make)
