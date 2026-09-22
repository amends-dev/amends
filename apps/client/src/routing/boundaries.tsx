import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Navigate, useLocation, useParams } from "@solidjs/router";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  createContext,
  createEffect,
  Match,
  Show,
  Switch,
  useContext,
  type ParentProps,
} from "solid-js";
import { Button } from "@amends/frontend/primitives/button";
import type { WorkspaceDirectory } from "../api/contracts.ts";
import { isUnauthorized } from "../api/client.ts";
import { useApiClient } from "../api/context.tsx";
import { directoryQuery } from "../api/directory.ts";
import { FoundationPage, SessionActions } from "../page.tsx";
import { useSession } from "../session/provider.tsx";
import { signInPath } from "./paths.ts";

const DirectoryContext = createContext<() => WorkspaceDirectory.Listing>();
const WorkspaceContext = createContext<() => WorkspaceDirectory.Membership>();
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("Workspace operations require a workspace route.");
  return workspace;
}

export function RequireSession(props: ParentProps) {
  const session = useSession();
  const location = useLocation();
  return (
    <Show
      when={session.session}
      fallback={<Navigate href={signInPath(location.pathname + location.search + location.hash)} />}
    >
      <ValidatedSession>{props.children}</ValidatedSession>
    </Show>
  );
}
function ValidatedSession(props: ParentProps) {
  const client = useApiClient();
  const session = useSession();
  const query = () => directoryQuery(client);
  const result = useAtomValue(query);
  const refresh = useAtomRefresh(query);
  createEffect(() => {
    const current = result();
    if (AsyncResult.isFailure(current) && isUnauthorized(current.cause)) session.replace(undefined);
  });
  const listing = () => {
    const current = result();
    return AsyncResult.isSuccess(current) ? current.value : undefined;
  };
  return (
    <Switch>
      <Match when={listing()}>
        {(value) => (
          <DirectoryContext.Provider value={value}>{props.children}</DirectoryContext.Provider>
        )}
      </Match>
      <Match when={AsyncResult.isFailure(result())}>
        <FoundationPage
          title="Unable to connect"
          message="Your session could not be checked. Try again when the host is available."
        >
          <Button onClick={refresh}>Try again</Button>
          <SessionActions />
        </FoundationPage>
      </Match>
      <Match when={true}>
        <FoundationPage title="Checking session" message="Connecting to your workspace host.">
          <span role="status">Loading…</span>
        </FoundationPage>
      </Match>
    </Switch>
  );
}
export function RequireWorkspace(props: ParentProps) {
  const directory = useContext(DirectoryContext);
  if (!directory) throw new Error("Workspace routes require session validation.");
  const params = useParams<{ workspaceId: string }>();
  const membership = () =>
    directory().memberships.find(
      (entry) => entry.workspace.id === params.workspaceId && entry.member.status === "active",
    );
  return (
    <Show
      when={membership()}
      keyed
      fallback={
        <FoundationPage
          title="Workspace unavailable"
          message="This workspace is unavailable or you no longer have access."
        >
          <SessionActions />
        </FoundationPage>
      }
    >
      {(current) => (
        <WorkspaceContext.Provider value={() => current}>
          {props.children}
        </WorkspaceContext.Provider>
      )}
    </Show>
  );
}
