import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Navigation } from "@amends/frontend/compositions/navigation";
import { Divider } from "@amends/frontend/primitives/divider";
import { Button } from "@amends/frontend/primitives/button";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { IconMarkNew } from "@amends/icons";
import { Column, Row } from "@amends/frontend/primitives/layout";
import { Text } from "@amends/frontend/primitives/text";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { DemoIcon } from "../../primitives/icon-button/icon-button.stories-support.tsx";
import "@amends/frontend/foundations/typography/fonts";
function DemoLinks(props: { onCreate?: () => void }) {
  return (
    <>
      <Navigation.Link target="_self" href="#home">
        <Navigation.Icon>
          <DemoIcon name="home" />
        </Navigation.Icon>
        <Navigation.Label>Home</Navigation.Label>
      </Navigation.Link>
      <Navigation.Link target="_self" href="#threads" aria-current="page">
        <Navigation.Icon>
          <DemoIcon name="threads" />
        </Navigation.Icon>
        <Navigation.Label>Threads</Navigation.Label>
        <Navigation.Count aria-label="3 unread">3</Navigation.Count>
      </Navigation.Link>
      <Navigation.Section>
        <Navigation.SectionHeader>
          <Navigation.SectionLabel>Workspace</Navigation.SectionLabel>
          <Divider.Line />
          <Navigation.SectionActions>
            <IconButton
              variant="ghost"
              aria-label="Create group"
              onClick={() => props.onCreate?.()}
            >
              <IconMarkNew />
            </IconButton>
          </Navigation.SectionActions>
        </Navigation.SectionHeader>
        <Navigation.Link target="_self" href="#groups">
          <Navigation.Icon>
            <DemoIcon name="groups" />
          </Navigation.Icon>
          <Navigation.Label>Groups</Navigation.Label>
        </Navigation.Link>
        <Navigation.Link target="_self" href="#members">
          <Navigation.Icon>
            <DemoIcon name="members" />
          </Navigation.Icon>
          <Navigation.Label>Members</Navigation.Label>
        </Navigation.Link>
      </Navigation.Section>
    </>
  );
}
const meta = {
  title: "Compositions/Navigation",
  parameters: {
    layout: "fullscreen" as const,
    a11y: {
      config: {
        checks: [
          {
            id: "region",
            options: {
              regionMatcher: "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip]",
            },
          },
        ],
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj;
export const Comparison = {
  render: () => (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Column gap={4} class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Text as="h2" variant="heading">
              {theme}
            </Text>
            <Row align="start" gap={6}>
              <Navigation.Root
                aria-label={`${theme} expanded`}
                style={{ width: "16rem", "max-width": "100%" }}
              >
                <DemoLinks />
              </Navigation.Root>
              <Navigation.Root aria-label={`${theme} rail`} compact>
                <DemoLinks />
              </Navigation.Root>
            </Row>
          </Column>
        )}
      </For>
    </main>
  ),
} satisfies Story;
function Toggle() {
  const [compact, setCompact] = createSignal(false);
  const [created, setCreated] = createSignal(0);
  return (
    <main class={colorThemes.soot} style={{ padding: "1.5rem", "min-height": "28rem" }}>
      <Column align="start" gap={4}>
        <Button variant="secondary" onClick={() => setCompact((value) => !value)}>
          Toggle rail
        </Button>
        <Navigation.Root
          aria-label="Workspace"
          compact={compact()}
          style={{ width: compact() ? "2.75rem" : "16rem", "max-width": "100%" }}
        >
          <DemoLinks onCreate={() => setCreated((n) => n + 1)} />
        </Navigation.Root>
        <Text as="p" role="status">
          Created groups: {created()}
        </Text>
      </Column>
    </main>
  );
}
export const Interaction = {
  render: () => <Toggle />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      link = canvas.getByRole("link", { name: "Groups" });
    const action = canvas.getByRole("button", { name: "Create group" });
    await userEvent.click(action);
    await expect(canvas.getByRole("status")).toHaveTextContent("Created groups: 1");
    // A caller can collapse navigation while focus is still inside the action slot.
    action.focus();
    canvas.getByRole("button", { name: "Toggle rail" }).click();
    await expect(canvas.queryByRole("button", { name: "Create group" })).toBeNull();
    await expect(canvas.getByRole("group", { name: "Workspace" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Groups" })).toBe(link);
    await expect(link).toHaveFocus();
    link.focus();
    await waitFor(() => expect(page.getByRole("tooltip")).toHaveTextContent("Groups"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
    await expect(link).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Toggle rail" }));
    await expect(canvas.getByRole("button", { name: "Create group" })).toBe(action);
    await userEvent.click(action);
    await expect(canvas.getByRole("status")).toHaveTextContent("Created groups: 2");
  },
} satisfies Story;
export const Rtl = {
  render: () => (
    <div dir="rtl">
      <Toggle />
    </div>
  ),
} satisfies Story;
