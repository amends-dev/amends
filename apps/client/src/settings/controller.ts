import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isUnauthorized } from "../api/client.ts";
import {
  settingsRequest,
  settingsFailure,
  type SettingsCommand,
  type SettingsData,
  type SettingsSection,
} from "../api/settings.ts";
import { useSession } from "../session/provider.tsx";

/** Mounted workspace/section scope; app/features remount this only when its identity changes. */
export function useSettings(workspaceId: string, section: SettingsSection) {
  const session = useSession();
  const atom = settingsRequest(useApiClient(), workspaceId, section);
  const result = useAtomValue(() => atom),
    execute = useAtomSet(() => atom);
  const [data, setData] = createSignal<SettingsData>();
  const [pending, setPending] = createSignal(false),
    [error, setError] = createSignal<string>();
  const [saved, setSaved] = createSignal(false),
    [needsRefresh, setNeedsRefresh] = createSignal(false);
  let alive = true,
    sequence = 0,
    active: number | undefined;
  onCleanup(() => {
    alive = false;
    active = undefined;
  });
  const send = (command: SettingsCommand) => {
    if (
      !alive ||
      !session.isCurrent() ||
      pending() ||
      (needsRefresh() && command.kind !== "refresh")
    )
      return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    active = ++sequence;
    execute({ attempt: active, command });
  };
  createEffect(
    on(result, (outcome) => {
      if (
        !alive ||
        !session.isCurrent() ||
        active === undefined ||
        outcome.waiting ||
        AsyncResult.isInitial(outcome)
      )
        return;
      if (AsyncResult.isSuccess(outcome) && outcome.value.attempt !== active) return;
      active = undefined;
      setPending(false);
      const exit = AsyncResult.isSuccess(outcome)
        ? outcome.value.exit
        : Exit.failCause(outcome.cause);
      const completed = AsyncResult.isSuccess(outcome) && outcome.value.completed;
      if (Exit.isFailure(exit)) {
        if (isUnauthorized(exit.cause)) {
          session.replace(undefined);
          return;
        }
        setNeedsRefresh(true);
        setError(
          completed
            ? "Saved, but the latest data could not be loaded. Refresh to continue."
            : settingsFailure(exit.cause),
        );
      } else {
        setData(exit.value);
        setNeedsRefresh(false);
        setSaved(completed);
      }
    }),
  );
  send({ kind: "refresh" });
  return {
    data,
    pending,
    error,
    saved,
    needsRefresh,
    send,
    refresh: () => send({ kind: "refresh" }),
  };
}
export type SettingsController = ReturnType<typeof useSettings>;
