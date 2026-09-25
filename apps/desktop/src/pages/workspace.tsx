import { useWorkspace } from "@amends/client";
import { useParams } from "@solidjs/router";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";

export function HomePage() {
  const params = useParams<{ workspaceId: string }>();
  const membership = useWorkspace(() => params.workspaceId);
  return (
    <Column gap={3}>
      <Text as="h2" variant="heading">
        {membership()?.workspace.name}
      </Text>
      <Text tone="secondary">Your workspace is ready. Work and activity will appear here.</Text>
    </Column>
  );
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
export function SettingsPage() {
  return (
    <Text tone="secondary">
      Workspace settings will appear here. Appearance is available from your account menu.
    </Text>
  );
}
export function MissingWorkspacePage() {
  return <Text>This page does not exist in the workspace.</Text>;
}
