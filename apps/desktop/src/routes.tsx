import { A, Navigate, Route, useLocation, useParams, useSearchParams } from "@solidjs/router";
import {
  DirectoryProvider,
  paths,
  returnPath,
  signInPath,
  useDirectory,
  useSession,
  useWorkspace,
} from "@amends/client";
import { Button } from "@amends/ui/primitives/button";
import { Row } from "@amends/ui/primitives/layout";
import { Match, Show, Switch, type ParentProps } from "solid-js";
import { PlaceholderPage as Page } from "./placeholder-page.tsx";
import { SignInPage } from "./pages/sign-in.tsx";
import { WorkspacePickerPage } from "./pages/workspace-picker.tsx";
import { CreateWorkspacePage } from "./pages/create-workspace.tsx";
import { WorkspaceLayout } from "./workspace-layout.tsx";
import {
  HomePage,
  TriagePage,
  TasksPage,
  EnvironmentsPage,
  ConnectionsPage,
  SettingsPage,
  MissingWorkspacePage,
} from "./pages/workspace.tsx";

function SessionActions() {
  const session = useSession();
  return (
    <Row gap={4}>
      <A href={paths.workspaces}>Workspaces</A>
      <Button variant="secondary" onClick={() => session.replace(undefined)}>
        Sign out
      </Button>
    </Row>
  );
}
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
        <Page
          title="Unable to connect"
          message="Your session could not be checked. Try again when the host is available."
        >
          <Button onClick={directory.retry}>Try again</Button>
          <SessionActions />
        </Page>
      </Match>
      <Match when={true}>
        <Page title="Checking session" message="Connecting to your workspace host.">
          <span role="status">Loading…</span>
        </Page>
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
      fallback={
        <Page
          title="Workspace unavailable"
          message="This workspace is unavailable or you no longer have access."
        >
          <SessionActions />
        </Page>
      }
    >
      <WorkspaceLayout>{props.children}</WorkspaceLayout>
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
          <Route path="/triage" component={TriagePage} />
          <Route path="/tasks" component={TasksPage} />
          <Route path="/environments" component={EnvironmentsPage} />
          <Route path="/connections" component={ConnectionsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="*missing" component={MissingWorkspacePage} />
        </Route>
      </Route>
      <Route
        path="*unmatched"
        component={() => <Page title="Page not found" message="This page does not exist." />}
      />
    </>
  );
}
