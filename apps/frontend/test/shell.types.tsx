import { Shell } from "@amends/frontend/compositions/shell";
import { Navigation } from "@amends/frontend/compositions/navigation";
import { Drawer } from "@amends/frontend/compositions/drawer";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Tooltip } from "@amends/frontend/primitives/tooltip";
export function examples() {
  <IconButton aria-label="Open navigation">☰</IconButton>;
  <IconButton tone="danger" variant="secondary" aria-label="Remove member">
    ×
  </IconButton>;
  <IconButton shape="circle" size="compact" variant="secondary" aria-label="More">
    ⋯
  </IconButton>;
  <IconButton shape="circle" size="compact" variant="soft" aria-label="Retry">
    ↻
  </IconButton>;
  // @ts-expect-error IconButton supports the same action tones as Button.
  <IconButton tone="warning" aria-label="Warning">
    !
  </IconButton>;
  <Tooltip.Root>
    <Tooltip.Trigger as={IconButton} aria-label="Search">
      s
    </Tooltip.Trigger>
    <Tooltip.Content>Find a conversation</Tooltip.Content>
  </Tooltip.Root>;
  <Navigation.Link href="/threads">
    <Navigation.Icon>t</Navigation.Icon>
    <Navigation.Label>Threads</Navigation.Label>
  </Navigation.Link>;
  <Shell.Root collapsed onCollapsedChange={(collapsed) => !collapsed}>
    <Shell.Body>
      <Shell.Main>Content</Shell.Main>
    </Shell.Body>
  </Shell.Root>;
  <Drawer.Root>
    <Drawer.Trigger>Open</Drawer.Trigger>
    <Drawer.Content>
      <Drawer.Title>Details</Drawer.Title>
      <Drawer.Close />
    </Drawer.Content>
  </Drawer.Root>;
  // @ts-expect-error An icon alone is not an accessible name.
  <IconButton>+</IconButton>;
  // @ts-expect-error Navigation is composed through children, not an icon prop.
  <Navigation.Link href="/" icon="x" />;
  // @ts-expect-error Tooltip content is noninteractive text.
  <Tooltip.Content>
    <button>Action</button>
  </Tooltip.Content>;
  // @ts-expect-error Sidebar content is a child, not a Root slot prop.
  <Shell.Root sidebar={<div />} />;
}
