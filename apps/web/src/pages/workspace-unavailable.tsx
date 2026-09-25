import { paths } from "@amends/client";
import { WorkspaceUnavailable } from "@amends/features/workspaces";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { useNavigate } from "@solidjs/router";
import { StandalonePage } from "../standalone-page.tsx";

/** Shown when a workspace route has no active membership. */
export function WorkspaceUnavailablePage(props: { readonly workspaceId: string }) {
  const navigate = useNavigate();
  return (
    <StandalonePage>
      <WorkspaceUnavailable.Root workspaceId={props.workspaceId}>
        <Column gap={6}>
          <WorkspaceUnavailable.Heading />
          <WorkspaceUnavailable.Reason />
          <WorkspaceUnavailable.Hint />
          <Row>
            <Button onClick={() => navigate(paths.workspaces)}>Your workspaces</Button>
          </Row>
        </Column>
      </WorkspaceUnavailable.Root>
    </StandalonePage>
  );
}
