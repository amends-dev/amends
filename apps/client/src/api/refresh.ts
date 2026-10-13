import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"

/**
 * Refresh a read from inside an operation and wait for the result that refresh produces. Reads
 * with invalidation keys report their refresh through a subscription, so the value current when
 * the refresh starts can still look settled; only a later settled value answers the refresh.
 */
export const refreshResult = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Effect.Effect<A, E, AtomRegistry.AtomRegistry> =>
  Effect.flatMap(AtomRegistry.AtomRegistry, (registry) =>
    Effect.callback<A, E>((resume) => {
      const before = registry.get(atom)
      const settle = (result: AsyncResult.AsyncResult<A, E>) => {
        if (result === before || AsyncResult.isInitial(result) || result.waiting) return false
        resume(AsyncResult.isSuccess(result) ? Exit.succeed(result.value) : Exit.failCause(result.cause))
        return true
      }
      const cancel = registry.subscribe(atom, (result) => {
        if (settle(result)) cancel()
      })
      registry.refresh(atom)
      if (settle(registry.get(atom))) {
        cancel()
        return
      }
      return Effect.sync(cancel)
    })
  )
