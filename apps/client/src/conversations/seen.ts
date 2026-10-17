import * as Exit from "effect/Exit"
import { createSignal, type Accessor } from "solid-js"
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts"
import { useWorkspaceMutation } from "../api/mutation.ts"
import { markSeen, markSeenThrough, type Notification } from "./api.ts"

export interface SeenController {
  /** The reader marked it seen here; the inbox shows it once it refreshes. */
  readonly seen: Accessor<boolean>
  readonly pending: Accessor<boolean>
  /** Why the last attempt failed. */
  readonly error: Accessor<WorkspaceFailure | undefined>
  readonly markSeen: () => void
}
/** Mark one of the reader's notifications seen without opening what it points to. */
export function useMarkSeen(workspaceId: string, notificationId: string): SeenController {
  const [seen, setSeen] = createSignal(false),
    [error, setError] = createSignal<WorkspaceFailure>()
  const request = useWorkspaceMutation(workspaceId, markSeen)
  async function mark() {
    if (seen()) return
    setError(undefined)
    const exit = await request.run(notificationId)
    if (exit === undefined) return
    if (Exit.isSuccess(exit)) setSeen(true)
    else setError(workspaceFailure(exit.cause))
  }
  return { seen, pending: request.pending, error, markSeen: () => void mark() }
}

export interface SeenAllController {
  readonly pending: Accessor<boolean>
  /** Why the last attempt failed. */
  readonly error: Accessor<WorkspaceFailure | undefined>
  /** Mark everything still pending seen, up to and including the newest notification shown. */
  readonly markAllSeen: (through: Pick<Notification.Notification, "recordedAt" | "id">) => void
}
/** Mark all of the reader's notifications seen, up to the newest they are shown. */
export function useMarkAllSeen(
  workspaceId: string,
  events: { readonly failed?: (failure: WorkspaceFailure) => void } = {}
): SeenAllController {
  const [error, setError] = createSignal<WorkspaceFailure>()
  const request = useWorkspaceMutation(workspaceId, markSeenThrough)
  async function markAll(through: Pick<Notification.Notification, "recordedAt" | "id">) {
    setError(undefined)
    const exit = await request.run(through)
    if (exit === undefined || Exit.isSuccess(exit)) return
    const failure = workspaceFailure(exit.cause)
    setError(failure)
    events.failed?.(failure)
  }
  return {
    pending: request.pending,
    error,
    markAllSeen: (through) => void markAll(through)
  }
}
