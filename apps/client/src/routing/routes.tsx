import { Navigate, Route, useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";
import { FoundationPage, SessionActions } from "../page.tsx";
import { useSession } from "../session/provider.tsx";
import { RequireSession, RequireWorkspace, useWorkspace } from "./boundaries.tsx";
import { paths, returnPath } from "./paths.ts";

function SignInRoute() {
  const session = useSession();
  const [search] = useSearchParams<{ returnTo?: string }>();
  return (
    <Show
      when={session.session}
      fallback={<FoundationPage title="Sign in" message="The sign-in page is coming next." />}
    >
      <RequireSession>
        <Navigate href={returnPath(search.returnTo)} />
      </RequireSession>
    </Show>
  );
}
function WorkspacesRoute() {
  return (
    <FoundationPage title="Workspaces" message="Your workspace pages will appear here.">
      <SessionActions />
    </FoundationPage>
  );
}
function WorkspaceRoute() {
  const workspace = useWorkspace();
  return (
    <FoundationPage
      title={workspace().workspace.name}
      message="This workspace is ready for its application pages."
    >
      <SessionActions />
    </FoundationPage>
  );
}
export function ApplicationRoutes() {
  return (
    <>
      <Route path="/" component={() => <Navigate href={paths.workspaces} />} />
      <Route path={paths.signIn} component={SignInRoute} />
      <Route component={RequireSession}>
        <Route path={paths.workspaces} component={WorkspacesRoute} />
        <Route path="/workspaces/:workspaceId" component={RequireWorkspace}>
          <Route path="/" component={WorkspaceRoute} />
        </Route>
      </Route>
      <Route
        path="*unmatched"
        component={() => (
          <FoundationPage title="Page not found" message="This page does not exist." />
        )}
      />
    </>
  );
}
