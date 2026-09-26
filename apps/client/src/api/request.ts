import { Effect, type Exit } from "effect";
import { Atom, type AtomRegistry, type Reactivity } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";

/** One ask of a request atom; the attempt tags its answer. */
export interface Ask<I> {
  readonly attempt: number;
  readonly input: I;
}
/** An operation's outcome, failures included, tagged with the attempt that asked for it. */
export interface Answer<A, E> {
  readonly attempt: number;
  readonly exit: Exit.Exit<A, E>;
}

/**
 * A private request atom over the credential-scoped API runtime. Each ask runs `operation` and
 * answers with its exit, so failures reach the caller as values tagged with their attempt.
 * Asking again or resetting interrupts the running operation; unmounting releases it.
 */
export const requestAtom = <I, A, E>(
  client: ApiClient,
  operation: (
    input: I,
    get: Atom.FnContext,
  ) => Effect.Effect<
    A,
    E,
    ApiClient["Identifier"] | AtomRegistry.AtomRegistry | Reactivity.Reactivity
  >,
) =>
  client.runtime
    .fn<Ask<I>>()(
      Effect.fnUntraced(function* ({ attempt, input }, get) {
        return { attempt, exit: yield* Effect.exit(operation(input, get)) } satisfies Answer<A, E>;
      }),
    )
    .pipe(Atom.setIdleTTL(0));
export type RequestAtom<I, A, E> = ReturnType<typeof requestAtom<I, A, E>>;
