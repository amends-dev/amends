import { Context, Effect, Exit, Layer, Option, Schema, Semaphore } from "effect";
import type { Cause, Scope } from "effect";
import type { WorkspaceId } from "../workspace/id.ts";
import { Store } from "./store.ts";

export class Aborted extends Schema.TaggedError<Aborted>()("Commit.Aborted", {
  cause: Schema.Defect(),
}) {}
export class Closed extends Schema.TaggedError<Closed>()("Commit.Closed", {}) {}
export class Foreign extends Schema.TaggedError<Foreign>()("Commit.Foreign", {}) {}
export class WriteForbidden extends Schema.TaggedError<WriteForbidden>()("Commit.WriteForbidden", {
  reason: Schema.String,
}) {}
/**
 * A commit's storage work began a step while another fiber's step was running. A commit runs its
 * reads and writes one at a time, so await each before the next; concurrent work in one commit is
 * a defect of the program that started it, raised as a defect and aborting the commit.
 */
export class Concurrent extends Schema.TaggedError<Concurrent>()("Commit.Concurrent", {}) {}

export type Error =
  | Store.Failure
  | Store.Conflict
  | Store.CommitUncertain
  | Aborted
  | Closed
  | Foreign
  | WriteForbidden;
export type Remaining<R> = Exclude<Exclude<R, Scope.Scope>, Store.Transaction>;

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  readonly run: <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Error, Remaining<R>>;
  /**
   * Run one compound write as a step of the commit, joining or starting it. Nested steps in the
   * same fiber run within it; a step from another fiber while it runs dies with Concurrent.
   */
  readonly operation: <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Error, Remaining<R>>;
  /**
   * Run a read as a step of the current commit, under the same rule as operation, so it never
   * overlaps the commit's writes. Outside a commit, run it as it is; after the commit ends, the
   * store rejects its expired handle.
   */
  readonly step: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/transaction/Service",
) {}

interface State {
  readonly owner: symbol;
  readonly native: Store.Transaction["Service"];
  readonly gate: Semaphore.Semaphore;
  active: boolean;
  failure: Option.Option<Cause.Cause<unknown>>;
}
class Current extends Context.Service<Current, State>()(
  "@amends/core/journal/transaction/Current",
) {}
class OperationOwner extends Context.Service<OperationOwner, number>()(
  "@amends/core/journal/transaction/OperationOwner",
) {}
class Forbidden extends Context.Service<Forbidden, string>()(
  "@amends/core/journal/transaction/Forbidden",
) {}

/** Projections may update their stores, but may not append new log entries. */
export const withoutAppends = <A, E, R>(program: Effect.Effect<A, E, R>, reason: string) =>
  Effect.provideService(program, Forbidden, reason);

const observe = <A, E, R>(program: Effect.Effect<A, E, R>, state: State) =>
  program.pipe(
    Effect.onExit((exit) =>
      Effect.sync(() => {
        if (Exit.isFailure(exit) && Option.isNone(state.failure))
          state.failure = Option.some(exit.cause);
      }),
    ),
  );

/**
 * Construct a transaction coordinator over host storage. Each acquisition owns its commits.
 *
 * @category constructors
 */
export const make = Effect.fn("Transaction.make")(function* (): Effect.fn.Return<
  Interface,
  never,
  Store.Service
> {
  const store = yield* Store.Service;
  const owner = Symbol("transaction coordinator");

  const run = Effect.fn("Commit.run")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Effect.serviceOption(Current);
    if (Option.isSome(current)) {
      const state = current.value;
      if (!state.active) return yield* new Closed({});
      if (state.owner !== owner) return yield* observe(Effect.fail(new Foreign({})), state);
      return yield* observe(
        program.pipe(Effect.scoped, Effect.provideService(Store.Transaction, state.native)),
        state,
      );
    }
    // A raw host transaction cannot safely acquire a second core commit context.
    if (Option.isSome(yield* Effect.serviceOption(Store.Transaction)))
      return yield* new Foreign({});

    return yield* store.transaction(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const storeTransaction = yield* Store.Transaction;
          const gate = yield* Semaphore.make(1);
          const state: State = {
            owner,
            native: storeTransaction,
            gate,
            active: true,
            failure: Option.none(),
          };
          const exit = yield* Effect.exit(
            restore(
              program.pipe(
                Effect.updateContext((context: Context.Context<R>) =>
                  Context.add(context, Current, state),
                ),
                Effect.scoped,
              ),
            ),
          );
          // Drain accepted writes and fence any late use of the inherited context.
          yield* gate.withPermits(1)(
            Effect.sync(() => {
              state.active = false;
            }),
          );
          if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);
          if (Option.isSome(state.failure))
            return yield* new Aborted({ cause: state.failure.value });
          return exit.value;
        }),
      ),
    );
  });

  /**
   * One step at a time: a step nested in the running one, on the same fiber, runs within it; any
   * other step while one runs is a concurrency defect rather than a wait, which could deadlock a
   * child fiber on its parent's step or interleave a read with a write the store has staged.
   */
  const exclusive = Effect.fnUntraced(function* <A, E, R>(
    state: State,
    program: Effect.Effect<A, E, R>,
  ) {
    const fiberId = yield* Effect.fiberId;
    const parent = yield* Effect.serviceOption(OperationOwner);
    if (Option.isSome(parent) && parent.value === fiberId) return yield* program;
    const result = yield* state.gate.withPermitsIfAvailable(1)(
      Effect.provideService(program, OperationOwner, fiberId),
    );
    if (Option.isNone(result)) return yield* observe(Effect.die(new Concurrent({})), state);
    return result.value;
  });

  const operation = Effect.fn("Commit.operation")(function* <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) {
    return yield* run(
      Effect.gen(function* () {
        const current = yield* Effect.serviceOption(Current);
        if (Option.isNone(current)) return yield* new Foreign({});
        const state = current.value;
        const forbidden = yield* Effect.serviceOption(Forbidden);
        if (Option.isSome(forbidden)) return yield* new WriteForbidden({ reason: forbidden.value });
        return yield* exclusive(
          state,
          observe(
            Effect.gen(function* () {
              if (!state.active) return yield* new Closed({});
              if (Option.isSome(state.failure))
                return yield* new Aborted({ cause: state.failure.value });
              return yield* program;
            }),
            state,
          ),
        );
      }),
    );
  });

  const step = Effect.fn("Commit.step")(function* <A, E, R>(program: Effect.Effect<A, E, R>) {
    const current = yield* Effect.serviceOption(Current);
    if (Option.isNone(current) || current.value.owner !== owner || !current.value.active)
      return yield* program;
    // A read's own failure leaves the commit as it was; only running concurrently aborts it.
    return yield* exclusive(current.value, program);
  });

  return Service.of({ workspaceId: store.workspaceId, run, operation, step });
});

/**
 * Provide one transaction coordinator over host storage.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Transaction from "./transaction.ts";
