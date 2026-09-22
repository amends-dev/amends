import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { For, onMount, onCleanup } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Tooltip } from "@amends/frontend/primitives/tooltip";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Button } from "@amends/frontend/primitives/button";
import { Row } from "@amends/frontend/primitives/layout";
import { Text } from "@amends/frontend/primitives/text";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import { DemoIcon } from "../icon-button/icon-button.stories-support.tsx";
import "@amends/frontend/foundations/typography/fonts";
const meta = {
  title: "Primitives/Tooltip",
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
  render: () => (
    <main class={colorThemes.cotton} style={{ padding: "4rem", "min-height": "12rem" }}>
      <Row>
        <Tooltip.Root>
          <Tooltip.Trigger as={IconButton} aria-label="Search workspace">
            <DemoIcon name="search" />
          </Tooltip.Trigger>
          <Tooltip.Content>Search conversations and members</Tooltip.Content>
        </Tooltip.Root>
        <Button variant="secondary">Next action</Button>
      </Row>
    </main>
  ),
} satisfies Meta;
export default meta;
export const Playground = {} satisfies StoryObj<typeof meta>;
export const Keyboard = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: "Search workspace" });
    trigger.focus();
    await waitFor(() => expect(page.getByRole("tooltip")).toBeVisible());
    await expect(trigger).toHaveAccessibleName("Search workspace");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("tooltip")).toBeNull());
    await expect(trigger).toHaveFocus();
  },
} satisfies StoryObj<typeof meta>;

function ReferenceSpecimen(props: { theme: ColorTheme; open?: boolean; long?: boolean }) {
  return (
    <section
      class={colorThemes[props.theme]}
      style={{
        padding: "4rem 1.5rem",
        "min-height": "10rem",
        "min-width": 0,
        "overflow-wrap": "anywhere",
        display: "grid",
        gap: "2rem",
        "align-content": "start",
      }}
    >
      <Text as="h2" variant="heading">
        {props.theme === "cotton" ? "Cotton" : "Soot"}
      </Text>
      <div>
        <Tooltip.Root defaultOpen={props.open}>
          <Tooltip.Trigger as={Button} variant="secondary">
            hover for tooltip
          </Tooltip.Trigger>
          <Tooltip.Content>
            {props.long
              ? "Accept this proposal after reviewing its changes. Reference: thread_abcdefghijklmnopqrstuvwxyz_1234567890."
              : "accept ⌘↵"}
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
      <Text tone="secondary">Compact monospace text, a dark surface, and a soft shadow.</Text>
    </section>
  );
}
function ComparisonSpecimen(props: { enlarged?: boolean; long?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const style = document.documentElement.style,
      previous = style.getPropertyValue("font-size"),
      priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%");
    onCleanup(() =>
      previous
        ? style.setProperty("font-size", previous, priority)
        : style.removeProperty("font-size"),
    );
  });
  return (
    <main
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
      }}
    >
      <For each={["cotton", "soot"] as const}>
        {(theme) => <ReferenceSpecimen theme={theme} open long={props.long} />}
      </For>
    </main>
  );
}
export const Reference = {
  render: () => (
    <main>
      <ReferenceSpecimen theme="cotton" />
    </main>
  ),
} satisfies StoryObj<typeof meta>;
export const Comparison = { render: () => <ComparisonSpecimen /> } satisfies StoryObj<typeof meta>;
export const LongContent = { render: () => <ComparisonSpecimen long /> } satisfies StoryObj<
  typeof meta
>;
export const EnlargedText = {
  render: () => <ComparisonSpecimen enlarged long />,
  tags: ["!autodocs"],
} satisfies StoryObj<typeof meta>;
