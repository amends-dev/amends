import { useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { createContext, createMemo, useContext, type Accessor, type ParentProps } from "solid-js";
import { workspaceFeed, WorkspaceFeedState } from "../api/changes.ts";
import { useApiClient } from "../api/context.tsx";
import { useSession } from "../session/provider.tsx";

export interface WorkspaceFeedScope {
  readonly state: Accessor<WorkspaceFeedState>;
}
const Context = createContext<WorkspaceFeedScope>();

/**
 * Keep the workspace's reads current while mounted: its change stream refreshes the reads each
 * commit affects. Rejected credentials end it (the HTTP layer signs them out); lost access
 * refreshes the directory, whose guard decides what the app shows. Mount once per workspace view, inside DirectoryProvider.
 */
export function WorkspaceFeedProvider(props: ParentProps<{ workspaceId: string }>) {
  const session = useSession();
  const client = useApiClient();
  // Credentials are immutable within this owner; a guest has no feed to open.
  const result = session.session
    ? useAtomValue(() => workspaceFeed(client, props.workspaceId))
    : undefined;
  const state = createMemo(() => {
    const current = result?.();
    if (!current) return WorkspaceFeedState.Ended({ reason: "unauthorized" });
    return AsyncResult.isSuccess(current) ? current.value : WorkspaceFeedState.Connecting();
  });
  return <Context.Provider value={{ state }}>{props.children}</Context.Provider>;
}
export function useWorkspaceFeed(): WorkspaceFeedScope {
  const scope = useContext(Context);
  if (!scope) throw new Error("Workspace feed state requires WorkspaceFeedProvider.");
  return scope;
}
