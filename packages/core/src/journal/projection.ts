import { Effect, Schema } from "effect";
import { Event } from "./event.ts";
import type { Fact } from "./fact.ts";
import { Store } from "./store.ts";
import { Transaction } from "./transaction.ts";

/** The decoded event supplied to a handler for this fact. */
export type Input<F extends Fact.Definition> = Event.Type<F>;

export interface Subscription<E, R> {
  readonly fact: Fact.Definition;
  /** Validates a decoded event and applies it within the current transaction. */
  readonly apply: (
    event: unknown,
  ) => Effect.Effect<void, E | Schema.SchemaError, R | Store.Transaction>;
}

/** A versioned read-model definition with subscriptions in registration order. */
export interface Definition<
  Name extends string = string,
  Version extends number = number,
  E = never,
  R = never,
> {
  readonly name: Name;
  readonly version: Version;
  readonly subscriptions: ReadonlyArray<Subscription<E, R>>;
  readonly on: <F extends Fact.Definition, E2, R2>(
    fact: F,
    handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>,
  ) => Definition<Name, Version, E | E2, R | R2>;
}

const build = <Name extends string, Version extends number, E, R>(
  name: Name,
  version: Version,
  subscriptions: ReadonlyArray<Subscription<E, R>>,
): Definition<Name, Version, E, R> => ({
  name,
  version,
  subscriptions,
  on<F extends Fact.Definition, E2, R2>(
    fact: F,
    handle: (event: Input<NoInfer<F>>) => Effect.Effect<void, E2, R2>,
  ) {
    const validate = Schema.decodeUnknownEffect(
      Schema.toType(Event.schema<F["name"], F["version"], F["payload"]>(fact)),
    );
    const apply = Effect.fn(`${name}.project.${fact.name}`)(function* (event: unknown) {
      yield* Store.Transaction;
      const input = yield* validate(event);
      yield* Transaction.withoutAppends(
        handle(input),
        `Projection ${name} cannot publish new log entries`,
      );
    });

    return build<Name, Version, E | E2, R | R2>(name, version, [...subscriptions, { fact, apply }]);
  },
});

/**
 * Starts a projection definition. Each on call returns a new definition.
 * Handlers update transaction-participating domain stores using event data;
 * they must remain safe to replay without external actions or new publications.
 */
export const make = <const Name extends string, const Version extends number>(
  name: Name,
  options: { readonly version: Version },
): Definition<Name, Version> => build<Name, Version, never, never>(name, options.version, []);

export * as Projection from "./projection.ts";
