import { Text } from "@amends/ui/primitives/text";

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
  return <Text>This page does not exist in the workspace.</Text>;
}
