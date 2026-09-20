import { Array, Context, Effect, Exit, Layer, Option, Schema, Semaphore } from "effect";
import type { Cause, Scope } from "effect";
import type { WorkspaceId } from "../workspace/id.ts";
import { CommittedEvents } from "./committed-events.ts";
import type { Event } from "./event.ts";
import { Store } from "./store.ts";

export class Aborted extends Schema.TaggedError<Aborted>()("Commit.Aborted", {
  cause: Schema.Defect(),
}) {}
export class Closed extends Schema.TaggedError<Closed>()("Commit.Closed", {}) {}
export class Foreign extends Schema.TaggedError<Foreign>()("Commit.Foreign", {}) {}
export class WriteForbidden extends Schema.TaggedError<WriteForbidden>()("Commit.WriteForbidden", {
  reason: Schema.String,
}) {}

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
  /** Serializes one compound write, allowing same-fiber nested appends. */
  readonly operation: <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | Error, Remaining<R>>;
  /** Journal-only collection of a canonical event after its projections succeed. */
  readonly recordEvent: (event: Event.Record) => Effect.Effect<void, Error>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/journal/transaction/Service",
) {}

interface State {
  readonly owner: symbol;
  readonly native: Store.Transaction["Service"];
  readonly gate: Semaphore.Semaphore;
  readonly events: Array<Event.Record>;
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
  Store.Service | CommittedEvents.Service
> {
  const store = yield* Store.Service;
  const committed = yield* CommittedEvents.Service;
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

    const events: Array<Event.Record> = [];
    return yield* store.transaction(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const native = yield* Store.Transaction;
          const gate = yield* Semaphore.make(1);
          const state: State = {
            owner,
            native,
            gate,
            events,
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
      {
        onCommit: Effect.suspend(() =>
          Array.isReadonlyArrayNonEmpty(events)
            ? committed.publish({
                workspaceId: committed.workspaceId,
                commitId: events[0].commitId,
                events,
              })
            : Effect.void,
        ),
      },
    );
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
        const fiberId = yield* Effect.fiberId;
        const parent = yield* Effect.serviceOption(OperationOwner);
        const execute = observe(
          Effect.gen(function* () {
            if (!state.active) return yield* new Closed({});
            if (Option.isSome(state.failure))
              return yield* new Aborted({ cause: state.failure.value });
            return yield* program;
          }),
          state,
        );
        if (Option.isSome(parent) && parent.value === fiberId) return yield* execute;
        return yield* state.gate.withPermits(1)(
          Effect.provideService(execute, OperationOwner, fiberId),
        );
      }),
    );
  });

  const recordEvent = Effect.fn("Commit.recordEvent")(function* (event: Event.Record) {
    const current = yield* Effect.serviceOption(Current);
    if (Option.isNone(current)) return yield* new Foreign({});
    const state = current.value;
    yield* operation(
      Effect.gen(function* () {
        if (event.commitId !== state.native.id) return yield* new Foreign({});
        state.events.push(Object.freeze(event));
      }),
    );
  });

  return Service.of({ workspaceId: committed.workspaceId, run, operation, recordEvent });
});

/**
 * Provide one transaction coordinator over host storage.
 *
 * @category layers
 */
export const layer = Layer.effect(Service, make());

export * as Transaction from "./transaction.ts";
