import { SettingsIndex, WorkspaceSettingsPage, MembersSettingsPage } from "./pages/settings.tsx";
import { Navigate, Route, useLocation, useParams, useSearchParams } from "@solidjs/router";
import {
  DirectoryProvider,
  paths,
  returnPath,
  signInPath,
  useDirectory,
  useSession,
  useWorkspace,
  WorkspaceFeedProvider,
} from "@amends/client";
import { CheckingSessionScreen, HostUnavailableScreen } from "@amends/ui/screens/standalone";
import { Match, Show, Switch, type ParentProps } from "solid-js";
import { useStandaloneAccount } from "./account.ts";
import { NotFoundPage } from "./pages/not-found.tsx";
import { SignInPage } from "./pages/sign-in.tsx";
import { WorkspacePickerPage } from "./pages/workspace-picker.tsx";
import { WorkspaceUnavailablePage } from "./pages/workspace-unavailable.tsx";
import { WorkspaceLayout } from "./workspace-layout.tsx";
import { GroupPage } from "./pages/group.tsx";
import { InboxPage } from "./pages/inbox.tsx";
import { GroupsPage } from "./pages/groups.tsx";
import { DirectPage } from "./pages/direct.tsx";
import { HomePage, TriagePage, TasksPage, MissingWorkspacePage } from "./pages/workspace.tsx";
import { AgentsPage } from "./pages/agents.tsx";
import { ConnectionsPage } from "./pages/connections.tsx";
import { EnvironmentsPage } from "./pages/environments.tsx";

function RequireSession(props: ParentProps) {
  const session = useSession();
  const location = useLocation();
  return (
    <Show
      when={session.session}
      fallback={
        // Signing out starts the next person afresh; otherwise sign-in returns to this page.
        <Navigate
          href={
            session.signedOut
              ? paths.signIn
              : signInPath(location.pathname + location.search + location.hash)
          }
        />
      }
    >
      <DirectoryProvider>
        <ValidatedSession>{props.children}</ValidatedSession>
      </DirectoryProvider>
    </Show>
  );
}
function ValidatedSession(props: ParentProps) {
  const directory = useDirectory();
  const account = useStandaloneAccount();
  return (
    <Switch>
      <Match when={directory.state()._tag === "Ready"}>{props.children}</Match>
      <Match when={directory.state()._tag === "Failed"}>
        <HostUnavailableScreen homeHref="#/" account={account()} onRetry={directory.retry} />
      </Match>
      <Match when={true}>
        <CheckingSessionScreen homeHref="#/" account={account()} />
      </Match>
    </Switch>
  );
}
function SignInRoute() {
  const session = useSession();
  const [search] = useSearchParams<{ returnTo?: string }>();
  return (
    <Switch>
      <Match when={!session.session}>
        <SignInPage />
      </Match>
      <Match when={session.session}>
        <RequireSession>
          <Navigate href={returnPath(search.returnTo)} />
        </RequireSession>
      </Match>
    </Switch>
  );
}
function WorkspaceRoute(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>();
  const workspace = useWorkspace(() => params.workspaceId);
  return (
    <Show
      when={workspace() !== undefined}
      fallback={<WorkspaceUnavailablePage workspaceId={params.workspaceId} />}
    >
      <WorkspaceFeedProvider workspaceId={params.workspaceId}>
        <WorkspaceLayout>{props.children}</WorkspaceLayout>
      </WorkspaceFeedProvider>
    </Show>
  );
}
export function ApplicationRoutes() {
  return (
    <>
      <Route path="/" component={() => <Navigate href={paths.workspaces} />} />
      <Route path={paths.signIn} component={SignInRoute} />
      <Route component={RequireSession}>
        <Route path={[paths.workspaces, paths.createWorkspace]} component={WorkspacePickerPage} />
        <Route path="/workspaces/:workspaceId" component={WorkspaceRoute}>
          <Route path="/" component={HomePage} />
          <Route path="/groups" component={GroupsPage} />
          <Route
            path={["/groups/:groupId", "/groups/:groupId/threads/:threadId"]}
            component={GroupPage}
          />
          <Route
            path={["/inbox", "/inbox/groups/:groupId/threads/:threadId"]}
            component={InboxPage}
          />
          <Route path="/direct" component={DirectPage} />
          <Route path="/triage" component={TriagePage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/agents" component={AgentsPage} />
          <Route path="/environments" component={EnvironmentsPage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route path="/settings">
            <Route path="/" component={SettingsIndex} />
            <Route path="/workspace" component={WorkspaceSettingsPage} />
            <Route path="/members" component={MembersSettingsPage} />
          </Route>
          <Route path="*missing" component={MissingWorkspacePage} />
        </Route>
      </Route>
      <Route path="*unmatched" component={NotFoundPage} />
    </>
  );
}
