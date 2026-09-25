import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { acceptInvitationRequest, settingsFailure } from "../api/settings.ts";
import { useApiClient } from "../api/context.tsx";
import { isUnauthorized } from "../api/client.ts";
import { useSession } from "../session/provider.tsx";
export function useAcceptInvitation(workspaceId: string, invitationId: string) {
  const session = useSession(),
    atom = acceptInvitationRequest(useApiClient());
  const result = useAtomValue(() => atom),
    execute = useAtomSet(() => atom);
  const [pending, setPending] = createSignal(false),
    [error, setError] = createSignal<string>(),
    [completed, setCompleted] = createSignal(false);
  let alive = true,
    attempt = 0;
  onCleanup(() => {
    alive = false;
  });
  createEffect(
    on(result, (outcome) => {
      if (
        !alive ||
        !session.isCurrent() ||
        !pending() ||
        outcome.waiting ||
        AsyncResult.isInitial(outcome)
      )
        return;
      if (AsyncResult.isSuccess(outcome) && outcome.value.attempt !== attempt) return;
      setPending(false);
      const exit = AsyncResult.isSuccess(outcome)
        ? outcome.value.exit
        : Exit.failCause(outcome.cause);
      if (AsyncResult.isSuccess(outcome) && outcome.value.completed) setCompleted(true);
      if (Exit.isFailure(exit)) {
        if (isUnauthorized(exit.cause)) session.replace(undefined);
        else
          setError(
            completed()
              ? "Joined. Refresh your workspaces to continue."
              : settingsFailure(exit.cause),
          );
      }
    }),
  );
  return {
    pending,
    error,
    completed,
    accept: () => {
      if (!alive || !session.session || !session.isCurrent() || pending()) return;
      setPending(true);
      setError(undefined);
      execute({ attempt: ++attempt, workspaceId, invitationId, refreshOnly: completed() });
    },
  };
}
