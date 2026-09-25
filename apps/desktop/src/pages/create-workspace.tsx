import { paths } from "@amends/client";
import { CreateWorkspace } from "@amends/features/workspaces";
import { Shell } from "@amends/ui/compositions/shell";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { useNavigate } from "@solidjs/router";

export function CreateWorkspacePage() {
  const navigate = useNavigate();
  return (
    <Shell.Body scroll="page">
      <Shell.Header>
        <Text as="span" variant="heading">
          amends
        </Text>
        <Button variant="ghost" onClick={() => navigate(paths.workspaces)}>
          Back to workspaces
        </Button>
      </Shell.Header>
      <Shell.Main>
        <Shell.Content width="narrow" centered>
          <Column gap={6}>
            <CreateWorkspace.Root
              onCreated={(id) => navigate(paths.workspace(id), { replace: true })}
            >
              <CreateWorkspace.Form />
              <CreateWorkspace.Result />
            </CreateWorkspace.Root>
          </Column>
        </Shell.Content>
      </Shell.Main>
    </Shell.Body>
  );
}
