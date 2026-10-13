import type * as Cause from "effect/Cause"
import type * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import type * as Reactivity from "effect/reactivity/Reactivity"
import { createSignal, type Accessor } from "solid-js"
import type { WorkspaceApi } from "./client.ts"
import { isStale, workspaceFailure, type WorkspaceFailure } from "./failures.ts"
import { useWorkspaceMutation } from "./mutation.ts"

type Services = AtomRegistry.AtomRegistry | Reactivity.Reactivity

/**
 * Why a change failed: a workspace failure, a page's own reason, or `refresh-failed` when it
 * completed but its result could not be read back. `problems` name what the host refused.
 */
export interface ChangeError<E extends string, P> {
  readonly error: E | WorkspaceFailure | "refresh-failed"
  readonly problems: ReadonlyArray<P>
}
/** A change's failure, or a reload's, with the action it belongs to. */
export type ChangeFailure<K extends string, E extends string, P> = ChangeError<E, P> & {
  readonly action: K | "refresh"
}

export interface ChangesOptions<C extends { readonly kind: string }, D, E extends string, P> {
  /** The workspace the page's changes are made in. */
  readonly workspaceId: string
  /** Write one change, answering with the ID of what it created, if anything. */
  readonly write: (api: WorkspaceApi, change: C) => Effect.Effect<string | undefined, unknown, Services>
  /** Reload what the page shows; a change is done once its result shows. */
  readonly reload: Effect.Effect<unknown, unknown, Services>
  /** How a failed write shows; by default, as its workspace failure. */
  readonly failed?: (cause: Cause.Cause<unknown>) => ChangeError<E, P>
  /** A change's result shows. `details` are what it was sent with. */
  readonly done: (change: C, created: string | undefined, details: D | undefined) => void
  /** A live reload of what the page shows has failed since it loaded. */
  readonly outdated: Accessor<boolean>
}

/**
 * The changes a page makes, one at a time, each followed by a reload of what the page shows: a
 * change is done once its result shows. A failure stays with the change it belongs to. One that
 * finds the page out of date makes changes wait for a refresh, as does a change whose result
 * could not be read back; the refresh that shows it completes it.
 */
export function useChanges<C extends { readonly kind: string }, D = undefined, E extends string = never, P = never>(
  options: ChangesOptions<C, D, E, P>
) {
  const write = useWorkspaceMutation(options.workspaceId, options.write)
  const reload = useWorkspaceMutation(options.workspaceId, () => options.reload)
  // The change running or last run, with what it was sent with, until it is done or set aside.
  const [attempt, setAttempt] = createSignal<{
    readonly action: C["kind"] | "refresh"
    readonly details?: D
  }>()
  const [running, setRunning] = createSignal<C["kind"] | "refresh">()
  const [error, setError] = createSignal<ChangeError<E, P>>()
  const [stale, setStale] = createSignal(false)
  const [revision, setRevision] = createSignal(0)
  // A change that completed but could not be read back, done once a refresh shows it.
  let unconfirmed: { readonly change: C; readonly created?: string; readonly details?: D } | undefined

  /** Reload, and complete `completed`, or a change waiting for a refresh, once it shows. */
  async function confirm(completed: typeof unconfirmed) {
    const exit = await reload.run()
    if (exit === undefined) return
    setRunning(undefined)
    if (Exit.isFailure(exit)) {
      if (completed) {
        unconfirmed = completed
        setStale(true)
        setError({ error: "refresh-failed", problems: [] })
      } else setError({ error: workspaceFailure(exit.cause), problems: [] })
      return
    }
    setStale(false)
    if (!completed) setRevision((value) => value + 1)
    const done = completed ?? unconfirmed
    unconfirmed = undefined
    setAttempt(undefined)
    if (done) options.done(done.change, done.created, done.details)
  }
  async function send(change: C, details?: D) {
    if (running() !== undefined || stale()) return
    setError(undefined)
    setAttempt({ action: change.kind, details })
    setRunning(change.kind)
    const exit = await write.run(change)
    if (exit === undefined) return
    if (Exit.isFailure(exit)) {
      setRunning(undefined)
      const failure = options.failed?.(exit.cause) ?? {
        error: workspaceFailure(exit.cause),
        problems: []
      }
      setError(failure)
      if (isStale(failure.error)) setStale(true)
      return
    }
    await confirm({ change, created: exit.value, details })
  }
  async function refresh() {
    if (running() !== undefined) return
    setError(undefined)
    // A refresh on behalf of a change keeps its failure with that change.
    if (!stale() || !attempt()) setAttempt({ action: "refresh" })
    setRunning("refresh")
    await confirm(undefined)
  }
  return {
    /** The change running, or `refresh`. */
    pending: running,
    /** The change running or last run, with what it was sent with. */
    attempt,
    failure: (): ChangeFailure<C["kind"], E | "outdated", P> | undefined => {
      const current = error()
      if (current === undefined)
        return options.outdated() ? { action: "refresh", error: "outdated", problems: [] } : undefined
      const action = attempt()?.action
      if (action) return { action, ...current }
      return stale() ? { action: "refresh", ...current } : undefined
    },
    /** What the page shows is out of date: changes wait for a refresh. */
    stale,
    /** Counts refreshes the reader asked for, so drafts can rebase on what they show. */
    revision,
    send: (change: C, details?: D) => void send(change, details),
    refresh: () => void refresh(),
    /** Set aside the last change's failure, as a dialog closes. */
    dismiss: () => {
      if (running() === undefined) setAttempt(undefined)
    }
  }
}
