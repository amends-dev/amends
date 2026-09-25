import { Exit } from "effect";
import { createSignal } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { acceptInvitationRequest } from "../api/settings.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

/** Why accepting failed, or `refresh-failed` when it joined but the directory did not reload. */
export type AcceptInvitationError = WorkspaceFailure | "refresh-failed";

/** Accept one invitation, then refresh the directory; after joining, retries only refresh. */
export function useAcceptInvitation(workspaceId: string, invitationId: string) {
  const session = useSession();
  const [error, setError] = createSignal<AcceptInvitationError>(),
    [completed, setCompleted] = createSignal(false);
  const request = useRequest(
    acceptInvitationRequest(useApiClient()),
    (exit) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      setCompleted(true);
      if (Exit.isFailure(exit.value.refreshed)) setError("refresh-failed");
    },
    { when: () => session.session !== undefined },
  );
  return {
    pending: request.pending,
    error,
    completed,
    accept: () => {
      if (request.pending()) return;
      setError(undefined);
      request.run({ workspaceId, invitationId, refreshOnly: completed() });
    },
  };
}
