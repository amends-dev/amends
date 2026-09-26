import {
  SettingsLayout,
  SettingsIndex,
  WorkspaceSettingsPage,
  MembersSettingsPage,
  InvitesSettingsPage,
} from "./pages/settings.tsx";
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
import { Button } from "@amends/ui/primitives/button";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Match, Show, Switch, type ParentProps } from "solid-js";
import { StandalonePage } from "./standalone-page.tsx";
import { NotFoundPage } from "./pages/not-found.tsx";
import { SignInPage } from "./pages/sign-in.tsx";
import { WorkspacePickerPage } from "./pages/workspace-picker.tsx";
import { CreateWorkspacePage } from "./pages/create-workspace.tsx";
import { WorkspaceUnavailablePage } from "./pages/workspace-unavailable.tsx";
import { WorkspaceLayout } from "./workspace-layout.tsx";
import { GroupPage } from "./pages/group.tsx";
import { InboxPage } from "./pages/inbox.tsx";
import { DirectPage } from "./pages/direct.tsx";
import {
  HomePage,
  TriagePage,
  TasksPage,
  EnvironmentsPage,
  ConnectionsPage,
  MissingWorkspacePage,
} from "./pages/workspace.tsx";

function RequireSession(props: ParentProps) {
  const session = useSession();
  const location = useLocation();
  return (
    <Show
      when={session.session}
      fallback={<Navigate href={signInPath(location.pathname + location.search + location.hash)} />}
    >
      <DirectoryProvider>
        <ValidatedSession>{props.children}</ValidatedSession>
      </DirectoryProvider>
    </Show>
  );
}
function ValidatedSession(props: ParentProps) {
  const directory = useDirectory();
  return (
    <Switch>
      <Match when={directory.state()._tag === "Ready"}>{props.children}</Match>
      <Match when={directory.state()._tag === "Failed"}>
        <StandalonePage>
          <EmptyState.Root size="page">
            <Drawing.Disconnected />
            <EmptyState.Text>
              <EmptyState.Title as="h1">Can’t reach your workspace host</EmptyState.Title>
              <EmptyState.Description>
                You’re still signed in. Try again once the host is running.
              </EmptyState.Description>
            </EmptyState.Text>
            <EmptyState.Actions>
              <Button onClick={directory.retry}>Try again</Button>
            </EmptyState.Actions>
          </EmptyState.Root>
        </StandalonePage>
      </Match>
      <Match when={true}>
        <StandalonePage>
          <EmptyState.Root size="page">
            <EmptyState.Text>
              <EmptyState.Title as="h1">Checking your session</EmptyState.Title>
              <EmptyState.Description role="status">
                Connecting to your workspace host…
              </EmptyState.Description>
            </EmptyState.Text>
          </EmptyState.Root>
        </StandalonePage>
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
        <Route path={paths.workspaces} component={WorkspacePickerPage} />
        <Route path={paths.createWorkspace} component={CreateWorkspacePage} />
        <Route path="/workspaces/:workspaceId" component={WorkspaceRoute}>
          <Route path="/" component={HomePage} />
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
          <Route path="/environments" component={EnvironmentsPage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route path="/settings" component={SettingsLayout}>
            <Route path="/" component={SettingsIndex} />
            <Route path="/workspace" component={WorkspaceSettingsPage} />
            <Route path="/members" component={MembersSettingsPage} />
            <Route path="/invites" component={InvitesSettingsPage} />
          </Route>
          <Route path="*missing" component={MissingWorkspacePage} />
        </Route>
      </Route>
      <Route path="*unmatched" component={NotFoundPage} />
    </>
  );
}
