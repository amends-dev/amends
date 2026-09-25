import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Cause, Exit } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { createEffect, createSignal, on, onCleanup, type Accessor } from "solid-js";
import type { RequestAtom } from "../api/request.ts";
import { useSession } from "../session/provider.tsx";

export interface Request<I> {
  /** An operation is running for this owner. */
  readonly pending: Accessor<boolean>;
  /**
   * Start the operation unless one is running or the owner no longer applies. Returns whether it
   * started. `settle` receives its outcome, possibly before this returns.
   */
  readonly run: (input: I) => boolean;
  /** Interrupt the running operation and ignore its outcome. Server work may still complete. */
  readonly cancel: () => void;
}

/**
 * Run a request atom for one mounted owner, one operation at a time. Only the latest attempt's
 * outcome reaches `settle`, and only while the owner is mounted, its credential scope is current,
 * and `when` holds. Rejected credentials need no handling here: the HTTP layer signs them out.
 */
export function useRequest<I, A, E>(
  atom: RequestAtom<I, A, E>,
  settle: (exit: Exit.Exit<A, E>, input: I) => void,
  options: { readonly when?: () => boolean } = {},
): Request<I> {
  const session = useSession();
  const result = useAtomValue(() => atom),
    execute = useAtomSet(() => atom);
  const [pending, setPending] = createSignal(false);
  let alive = true,
    sequence = 0,
    active: { readonly attempt: number; readonly input: I } | undefined;
  onCleanup(() => {
    alive = false;
    active = undefined;
    // Releasing the atom interrupts it; never write to a registry that may be disposed.
  });
  const current = () => alive && session.isCurrent() && (options.when?.() ?? true);
  const receive = (outcome: ReturnType<typeof result>) => {
    if (!active || !current() || outcome.waiting || AsyncResult.isInitial(outcome)) return;
    if (AsyncResult.isSuccess(outcome) && outcome.value.attempt !== active.attempt) return;
    const { input } = active;
    active = undefined;
    setPending(false);
    // Operations answer with their own exits; the atom itself fails only unexpectedly.
    settle(
      AsyncResult.isSuccess(outcome) ? outcome.value.exit : Exit.die(Cause.squash(outcome.cause)),
      input,
    );
  };
  createEffect(on(result, receive));
  return {
    pending,
    run: (input) => {
      if (active || !current()) return false;
      active = { attempt: ++sequence, input };
      setPending(true);
      execute({ attempt: active.attempt, input });
      // An operation that completes synchronously has already answered.
      receive(result());
      return true;
    },
    cancel: () => {
      if (!active) return;
      active = undefined;
      setPending(false);
      if (alive) execute(Atom.Reset);
    },
  };
}
