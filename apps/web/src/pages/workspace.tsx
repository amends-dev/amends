import { paths } from "@amends/client";
import { Button } from "@amends/ui/components/button";
import { EmptyState } from "@amends/ui/components/empty-state";
import { Pane } from "@amends/ui/patterns/pane";
import { Shell } from "@amends/ui/patterns/shell";
import { useNavigate, useParams } from "@solidjs/router";
import type { JSX } from "solid-js";

/** A workspace page that is still a placeholder: its title and what it will hold. */
function Placeholder(props: {
  readonly title: string;
  /** What the page will hold. */
  readonly heading: string;
  readonly line: string;
  readonly children?: JSX.Element;
}) {
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title>{props.title}</Pane.Title>
      </Pane.Header>
      <Pane.Body>
        <EmptyState title={props.heading} lines={[props.line]}>
          {props.children}
        </EmptyState>
      </Pane.Body>
    </Pane.Root>
  );
}

export function HomePage() {
  return (
    <Placeholder
      title="Home"
      heading="Your workspace is ready"
      line="Work and activity will appear here."
    />
  );
}
export function TriagePage() {
  return (
    <Placeholder
      title="Triage"
      heading="Nothing to triage"
      line="A place to review what needs your attention."
    />
  );
}
export function TasksPage() {
  return (
    <Placeholder
      title="Tasks"
      heading="No tasks yet"
      line="A place to track work and follow its progress."
    />
  );
}
export function MissingWorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  return (
    <Placeholder
      title="Not found"
      heading="Nothing on this page"
      line="This page doesn’t exist in the workspace."
    >
      <Button onClick={() => navigate(paths.workspace(params.workspaceId))}>Workspace home</Button>
    </Placeholder>
  );
}
