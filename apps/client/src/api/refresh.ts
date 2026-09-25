import { Effect, Exit } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

/**
 * Refresh a read from inside an operation and wait for the result that refresh produces. Reads
 * with invalidation keys report their refresh through a subscription, so the value current when
 * the refresh starts can still look settled; only a later settled value answers the refresh.
 */
export const refreshResult = <A, E>(
  get: Atom.FnContext,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
): Effect.Effect<A, E> =>
  Effect.callback<A, E>((resume) => {
    const before = get.registry.get(atom);
    const settle = (result: AsyncResult.AsyncResult<A, E>) => {
      if (result === before || AsyncResult.isInitial(result) || result.waiting) return false;
      resume(
        AsyncResult.isSuccess(result) ? Exit.succeed(result.value) : Exit.failCause(result.cause),
      );
      return true;
    };
    const cancel = get.registry.subscribe(atom, (result) => {
      if (settle(result)) cancel();
    });
    get.refresh(atom);
    if (settle(get.registry.get(atom))) {
      cancel();
      return;
    }
    return Effect.sync(cancel);
  });
