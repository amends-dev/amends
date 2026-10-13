import { useAtomSet } from "@effect/atom-solid/Hooks"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Atom from "effect/reactivity/Atom"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import type * as Reactivity from "effect/reactivity/Reactivity"
import { createSignal, onCleanup, type Accessor } from "solid-js"
import { useApiClient, useWorkspaceClient } from "../provider.tsx"
import type { Api, ApiClient, WorkspaceApi } from "./client.ts"

type Services = AtomRegistry.AtomRegistry | Reactivity.Reactivity

export interface Mutation<I, A, E> {
  /** An operation is running. */
  readonly pending: Accessor<boolean>
  /**
   * Run the operation unless one is running, and answer with its exit. The answer is undefined
   * when it did not start, or when it was cancelled or its owner unmounted before it finished.
   */
  readonly run: (input: I) => Promise<Exit.Exit<A, E> | undefined>
  /** Interrupt the running operation. Server work may still complete. */
  readonly cancel: () => void
}

/**
 * Run an operation through the session's client, which acts in no workspace, for the mounted
 * owner, one at a time; unmounting interrupts it. Signing in or out remounts every owner, so an
 * answer never reaches another credential's screens. Rejected credentials need no handling here:
 * the API client signs them out.
 */
export function useMutation<A, E, I = void>(
  operation: (api: Api, input: I) => Effect.Effect<A, E, Services>
): Mutation<I, A, E> {
  return useMutationOn(useApiClient(), operation)
}

/** Run an operation through the client of the workspace `workspaceId`, as `useMutation` runs one. */
export function useWorkspaceMutation<A, E, I = void>(
  workspaceId: string,
  operation: (api: WorkspaceApi, input: I) => Effect.Effect<A, E, Services>
): Mutation<I, A, E> {
  return useMutationOn(useWorkspaceClient(workspaceId), operation)
}

function useMutationOn<A, E, I>(
  client: ApiClient,
  operation: (api: WorkspaceApi, input: I) => Effect.Effect<A, E, Services>
): Mutation<I, A, E> {
  const atom = client.runtime
    .fn<I>()((input) =>
      Effect.gen(function* () {
        return yield* operation(yield* client, input)
      })
    )
    .pipe(Atom.setIdleTTL(0))
  const start = useAtomSet(() => atom, { mode: "promiseExit" }),
    interrupt = useAtomSet(() => atom)
  const [pending, setPending] = createSignal(false)
  let mounted = true,
    runs = 0,
    // The run whose answer is awaited, or 0.
    running = 0
  const cancel = () => {
    if (running === 0) return
    running = 0
    setPending(false)
    interrupt(Atom.Interrupt)
  }
  onCleanup(() => {
    cancel()
    mounted = false
  })
  return {
    pending,
    cancel,
    run: async (input) => {
      if (running !== 0 || !mounted) return undefined
      const run = (running = ++runs)
      setPending(true)
      const exit = await start(input)
      if (running !== run) return undefined
      running = 0
      setPending(false)
      return exit
    }
  }
}
