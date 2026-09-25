import { paths, useSession } from "@amends/client";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { useNavigate } from "@solidjs/router";
import { StandalonePage } from "../standalone-page.tsx";

/** An address that matches no route, for guests and signed-in people alike. */
export function NotFoundPage() {
  const session = useSession();
  const navigate = useNavigate();
  return (
    <StandalonePage>
      <EmptyState.Root size="page">
        <Drawing.Bare />
        <EmptyState.Text>
          <EmptyState.Title as="h1">Nothing at this address</EmptyState.Title>
          <EmptyState.Description>
            This page doesn’t exist. Check the link, or start again from your workspaces.
          </EmptyState.Description>
        </EmptyState.Text>
        <EmptyState.Actions>
          <Button onClick={() => navigate(session.session ? paths.workspaces : paths.signIn)}>
            {session.session ? "Your workspaces" : "Sign in"}
          </Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </StandalonePage>
  );
}
