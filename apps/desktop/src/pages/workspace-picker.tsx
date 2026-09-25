import { paths, useSession } from "@amends/client";
import { WorkspacePicker } from "@amends/features/workspaces";
import { Shell } from "@amends/ui/compositions/shell";
import { ItemList } from "@amends/ui/compositions/item-list";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";

export function WorkspacePickerPage() {
  const session = useSession();
  return (
    <Shell.Body scroll="page">
      <Shell.Header>
        <Text as="span" variant="heading">
          amends
        </Text>
        <Row>
          <Text as="span" variant="mono" tone="secondary">
            {session.session?.humanId}
          </Text>
          <Button variant="secondary" onClick={() => session.replace(undefined)}>
            Sign out
          </Button>
        </Row>
      </Shell.Header>
      <Shell.Main>
        <Shell.Content width="medium">
          <WorkspacePicker.Root>
            <Column gap={6}>
              <Column gap={2}>
                <Text as="h1" variant="heading">
                  Where are you working?
                </Text>
                <WorkspacePicker.Summary />
              </Column>
              <WorkspacePicker.List workspaceHref={(id) => `#${paths.workspace(id)}`} />
              <WorkspacePicker.Invitations />
              <WorkspacePicker.Empty />
              <ItemList.Root variant="outline" aria-label="Workspace actions">
                <ItemList.Item>
                  <ItemList.Link href={`#${paths.createWorkspace}`}>
                    <ItemList.Leading>
                      <WorkspaceMark decorative>+</WorkspaceMark>
                    </ItemList.Leading>
                    <ItemList.Content>
                      <ItemList.Title>New workspace</ItemList.Title>
                      <ItemList.Description>A shared place for your work.</ItemList.Description>
                    </ItemList.Content>
                  </ItemList.Link>
                </ItemList.Item>
              </ItemList.Root>
              <WorkspacePicker.Status />
            </Column>
          </WorkspacePicker.Root>
        </Shell.Content>
      </Shell.Main>
    </Shell.Body>
  );
}
