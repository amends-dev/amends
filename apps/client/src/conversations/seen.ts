import { Exit } from "effect";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  markSeenRequest,
  markSeenThroughRequest,
  type Notification,
} from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

export interface SeenController {
  /** The reader marked it seen here; the inbox shows it once it refreshes. */
  readonly seen: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  readonly markSeen: () => void;
}
/** Mark one of the reader's notifications seen without opening what it points to. */
export function useMarkSeen(workspaceId: string, notificationId: string): SeenController {
  const session = useSession();
  const [seen, setSeen] = createSignal(false),
    [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    markSeenRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isSuccess(exit)) setSeen(true);
      else setError(workspaceFailure(exit.cause));
    },
    { when: () => session.session !== undefined },
  );
  return {
    seen,
    pending: request.pending,
    error,
    markSeen: () => {
      if (seen()) return;
      setError(undefined);
      request.run(notificationId);
    },
  };
}

export interface SeenAllController {
  readonly pending: Accessor<boolean>;
  /** Why the last attempt failed. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Mark everything still pending seen, up to and including the newest notification shown. */
  readonly markAllSeen: (through: Pick<Notification.Record, "recordedAt" | "id">) => void;
}
/** Mark all of the reader's notifications seen, up to the newest they are shown. */
export function useMarkAllSeen(
  workspaceId: string,
  events: { readonly failed?: (failure: WorkspaceFailure) => void } = {},
): SeenAllController {
  const session = useSession();
  const [error, setError] = createSignal<WorkspaceFailure>();
  const request = useRequest(
    markSeenThroughRequest(useApiClient(), workspaceId),
    (exit) => {
      if (Exit.isSuccess(exit)) return;
      const failure = workspaceFailure(exit.cause);
      setError(failure);
      events.failed?.(failure);
    },
    { when: () => session.session !== undefined },
  );
  return {
    pending: request.pending,
    error,
    markAllSeen: (through) => {
      setError(undefined);
      request.run(through);
    },
  };
}
