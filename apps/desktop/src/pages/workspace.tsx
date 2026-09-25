import { paths } from "@amends/client";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Text } from "@amends/ui/primitives/text";
import { useNavigate, useParams } from "@solidjs/router";

export function HomePage() {
  return <Text tone="secondary">Your workspace is ready. Work and activity will appear here.</Text>;
}
export function TriagePage() {
  return <Text tone="secondary">A place to review what needs your attention.</Text>;
}
export function TasksPage() {
  return <Text tone="secondary">A place to track work and follow its progress.</Text>;
}
export function EnvironmentsPage() {
  return <Text tone="secondary">Configure where your agents work.</Text>;
}
export function ConnectionsPage() {
  return <Text tone="secondary">Manage the services your workspace connects to.</Text>;
}
export function MissingWorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  return (
    <EmptyState.Root>
      <Drawing.Bare />
      <EmptyState.Text>
        <EmptyState.Title>Nothing on this page</EmptyState.Title>
        <EmptyState.Description>This page doesn’t exist in the workspace.</EmptyState.Description>
      </EmptyState.Text>
      <EmptyState.Actions>
        <Button onClick={() => navigate(paths.workspace(params.workspaceId))}>
          Workspace home
        </Button>
      </EmptyState.Actions>
    </EmptyState.Root>
  );
}
