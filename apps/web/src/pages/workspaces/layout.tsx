import { Workspace } from "@amends/core/workspace";
import { Button, Notice, Shell, Text } from "@amends/ui/components";
import { useAtomSet } from "@effect/atom-solid";
import { Navigate, useParams } from "@solidjs/router";
import { Schema } from "effect";
import { createEffect, Show, Suspense, type ParentProps } from "solid-js";
import { Me } from "../../api/me.ts";
import { useQuery } from "../../api/hooks.ts";
import { explain, failureOf } from "../../api/errors.ts";
import { AccountMenu } from "../../features/session/account-menu.tsx";
import { WorkspaceIdentity } from "../../features/workspaces/workspace-identity.tsx";
import { WorkspaceNavigation } from "../../features/workspaces/workspace-navigation.tsx";
import { lastWorkspaceAtom } from "../../session/session.ts";
import { useSession } from "../../session/boundary.tsx";
import { WorkspaceBoundary } from "../../workspace/boundary.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { href } from "../../routes.tsx";
import { WorkspaceAccessPage } from "./access-unavailable.tsx";
const isWorkspaceId = Schema.is(Workspace.Id);
export function WorkspaceLayout(props: ParentProps) {
  const session = useSession();
  const params = useParams<{ workspaceId: string }>();
  const id = () => (isWorkspaceId(params.workspaceId) ? params.workspaceId : undefined);
  return (
    <Show when={session.session} fallback={<Navigate href={href.signIn()} />}>
      <Show when={id()} fallback={<WorkspaceAccessPage />}>
        {(workspaceId) => (
          <WorkspaceBoundary
            workspaceId={workspaceId()}
            loading={<WorkspaceAccessPage loading />}
            error={(cause, retry) => <WorkspaceAccessPage cause={cause} retry={retry} />}
            unavailable={(membership) => <WorkspaceAccessPage membership={membership} />}
          >
            <WorkspaceFrame>{props.children}</WorkspaceFrame>
          </WorkspaceBoundary>
        )}
      </Show>
    </Show>
  );
}
function WorkspaceFrame(props: ParentProps) {
  const membership = useWorkspace();
  const setLast = useAtomSet(() => lastWorkspaceAtom);
  const directory = useQuery(Me.workspaces);
  createEffect(() => setLast(membership().workspace.id));
  return (
    <Shell.Root>
      <Shell.Sidebar>
        <Shell.SidebarHeader>
          <WorkspaceIdentity />
        </Shell.SidebarHeader>
        <Shell.NavigationToggle placement="sidebar" />
        <Shell.SidebarContent>
          <WorkspaceNavigation />
        </Shell.SidebarContent>
        <Shell.SidebarActions>
          <AccountMenu />
        </Shell.SidebarActions>
      </Shell.Sidebar>
      <Shell.Body>
        <Suspense
          fallback={
            <Shell.Main>
              <Text role="status">Loading page…</Text>
            </Shell.Main>
          }
        >
          {props.children}
        </Suspense>
        <Show when={failureOf(directory.result())}>
          {(failure) => (
            <Shell.Footer>
              <Notice tone="danger">
                Workspace information may be out of date. {explain(failure().cause)}{" "}
                <Button onClick={directory.refresh}>try again</Button>
              </Notice>
            </Shell.Footer>
          )}
        </Show>
      </Shell.Body>
    </Shell.Root>
  );
}
