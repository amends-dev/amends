import { DocumentTitle } from "../../components/document-title.tsx";
import type { WorkspaceDirectory } from "@amends/gateway/directory";
import { Button, ContentColumn, Notice, PageHeading, Shell, Text } from "@amends/ui/components";
import { useNavigate } from "@solidjs/router";
import type { Cause } from "effect";
import { Match, Switch } from "solid-js";
import { explain } from "../../api/errors.ts";
import { BrandLink } from "../../components/brand-link.tsx";
import { PolicyLinks } from "../../components/policy-links.tsx";
import { AccountMenu } from "../../features/session/account-menu.tsx";
import { href } from "../../routes.tsx";
export function WorkspaceAccessPage(props: {
  loading?: boolean;
  cause?: Cause.Cause<unknown>;
  retry?: () => void;
  membership?: WorkspaceDirectory.Membership | undefined;
}) {
  const navigate = useNavigate();
  return (
    <Shell.Root>
      <DocumentTitle title="Workspace access" />
      <Shell.Body>
        <Shell.Header>
          <BrandLink />
          <AccountMenu />
        </Shell.Header>
        <Shell.Main>
          <ContentColumn align="center">
            <PageHeading
              title={
                props.loading
                  ? "Opening the workspace"
                  : props.cause
                    ? "The workspace could not be loaded"
                    : "That workspace is closed to you"
              }
            />
            <Switch>
              <Match when={props.loading}>
                <Text role="status">Checking your membership.</Text>
              </Match>
              <Match when={props.cause}>
                {(cause) => (
                  <>
                    <Notice tone="danger">{explain(cause())}</Notice>
                    <Button onClick={props.retry}>try again</Button>
                  </>
                )}
              </Match>
              <Match when={true}>
                <Notice tone="danger">
                  {props.membership
                    ? `Your membership of ${props.membership.workspace.name} has ended. The work you did stays on that workspace's record.`
                    : "You are not a member of this workspace. If someone shared a link with you, ask them for an invitation."}
                </Notice>
                <Text>Rejoining needs a fresh invitation. An old link will not work.</Text>
                <Button onClick={() => navigate(href.picker({ choose: true }))}>
                  your other workspaces
                </Button>
              </Match>
            </Switch>
          </ContentColumn>
        </Shell.Main>
        <Shell.Footer>
          <PolicyLinks />
        </Shell.Footer>
      </Shell.Body>
    </Shell.Root>
  );
}
