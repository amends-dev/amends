import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Data } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  createContext,
  createEffect,
  createMemo,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import type { WorkspaceDirectory } from "../api/contracts.ts";
import { isUnauthorized } from "../api/client.ts";
import { useApiClient } from "../api/context.tsx";
import { directoryQuery } from "../api/directory.ts";
import { useSession } from "./provider.tsx";

export type DirectoryState = Data.TaggedEnum<{
  SignedOut: {};
  Loading: {};
  Ready: { readonly listing: WorkspaceDirectory.Listing };
  Failed: {};
}>;
const DirectoryState = Data.taggedEnum<DirectoryState>();
export interface DirectoryScope {
  readonly state: Accessor<DirectoryState>;
  readonly retry: () => void;
}
const DirectoryContext = createContext<DirectoryScope>();

/** Validates credentials and exposes data/state, without choosing routes or presentations. */
export function DirectoryProvider(props: ParentProps) {
  const client = useApiClient();
  const session = useSession();
  const query = () => directoryQuery(client);
  // Credentials are immutable within this owner; replacement remounts the provider.
  const read = session.session
    ? { result: useAtomValue(query), retry: useAtomRefresh(query) }
    : undefined;
  createEffect(() => {
    const current = read?.result();
    if (current && AsyncResult.isFailure(current) && isUnauthorized(current.cause))
      session.replace(undefined);
  });
  const state = createMemo<DirectoryState>(() => {
    if (!read) return DirectoryState.SignedOut();
    const current = read.result();
    if (AsyncResult.isSuccess(current)) return DirectoryState.Ready({ listing: current.value });
    if (AsyncResult.isFailure(current)) return DirectoryState.Failed();
    return DirectoryState.Loading();
  });
  return (
    <DirectoryContext.Provider value={{ state, retry: () => read?.retry() }}>
      {props.children}
    </DirectoryContext.Provider>
  );
}
export function useDirectory(): DirectoryScope {
  const directory = useContext(DirectoryContext);
  if (!directory) throw new Error("Directory operations require DirectoryProvider.");
  return directory;
}
/** The caller supplies identity; no router or presentation dependency is required. */
export function useWorkspace(
  workspaceId: Accessor<string>,
): Accessor<WorkspaceDirectory.Membership | undefined> {
  const directory = useDirectory();
  return createMemo(() => {
    const state = directory.state();
    return state._tag === "Ready"
      ? state.listing.memberships.find(
          (entry) => entry.workspace.id === workspaceId() && entry.member.status === "active",
        )
      : undefined;
  });
}
