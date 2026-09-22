import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Navigation } from "@amends/frontend/compositions/navigation";
import { Button } from "@amends/frontend/primitives/button";
import { Column, Row } from "@amends/frontend/primitives/layout";
import { Text } from "@amends/frontend/primitives/text";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { DemoIcon } from "../../primitives/icon-button/icon-button.stories-support.tsx";
import "@amends/frontend/foundations/typography/fonts";
function DemoLinks() {
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
        <Navigation.SectionLabel>Workspace</Navigation.SectionLabel>
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
          <DemoLinks />
        </Navigation.Root>
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
    await userEvent.click(canvas.getByRole("button", { name: "Toggle rail" }));
    await expect(canvas.getByRole("link", { name: "Groups" })).toBe(link);
    link.focus();
    await waitFor(() => expect(page.getByRole("tooltip")).toHaveTextContent("Groups"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
    await expect(link).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Toggle rail" }));
  },
} satisfies Story;
