import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { createContext, createMemo, useContext, type Accessor, type ParentProps } from "solid-js";
import { changeFeed, ChangeFeedState } from "./api.ts";
import { useApiClient, useSession } from "../provider.tsx";

export interface ChangeFeedScope {
  readonly state: Accessor<ChangeFeedState>;
}
const Context = createContext<ChangeFeedScope>();

/**
 * Keep the workspace's reads current while mounted: its change stream refreshes the reads each
 * commit affects. Rejected credentials end it (the HTTP layer signs them out); lost access
 * refreshes the directory, whose guard decides what the app shows. Mount once per workspace view, inside DirectoryProvider.
 */
export function ChangeFeedProvider(props: ParentProps<{ workspaceId: string }>) {
  const session = useSession();
  const client = useApiClient();
  // Credentials are immutable within this owner; a guest has no feed to open.
  const result = session.session
    ? useAtomValue(() => changeFeed(client, props.workspaceId))
    : undefined;
  const state = createMemo(() => {
    const current = result?.();
    if (!current) return ChangeFeedState.Ended({ reason: "unauthorized" });
    return AsyncResult.isSuccess(current) ? current.value : ChangeFeedState.Connecting();
  });
  return <Context.Provider value={{ state }}>{props.children}</Context.Provider>;
}
export function useChangeFeed(): ChangeFeedScope {
  const scope = useContext(Context);
  if (!scope) throw new Error("Change feed state requires ChangeFeedProvider.");
  return scope;
}
