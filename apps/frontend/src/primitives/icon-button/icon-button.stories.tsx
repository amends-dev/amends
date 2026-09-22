import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Row, Column } from "@amends/frontend/primitives/layout";
import { Text } from "@amends/frontend/primitives/text";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import "@amends/frontend/foundations/typography/fonts";
import { DemoIcon } from "./icon-button.stories-support.tsx";
const meta = {
  title: "Primitives/IconButton",
  parameters: { layout: "fullscreen" as const },
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
            <For each={["primary", "secondary", "ghost"] as const}>
              {(variant) => (
                <Row gap={4}>
                  <Text>{variant}</Text>
                  <IconButton variant={variant} aria-label="Add member">
                    <DemoIcon name="plus" />
                  </IconButton>
                  <IconButton variant={variant} aria-label="Search">
                    <DemoIcon name="search" />
                  </IconButton>
                  <IconButton variant={variant} aria-label="Unavailable notifications" disabled>
                    <DemoIcon name="bell" />
                  </IconButton>
                </Row>
              )}
            </For>
          </Column>
        )}
      </For>
    </main>
  ),
} satisfies Story;
function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Row>
        <IconButton aria-label="Add one" onClick={() => setCount((n) => n + 1)}>
          <DemoIcon name="plus" />
        </IconButton>
        <Text role="status">Count: {count()}</Text>
      </Row>
    </main>
  );
}
export const Interaction = {
  render: () => <Counter />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      button = canvas.getByRole("button", { name: "Add one" });
    await userEvent.click(button);
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("status")).toHaveTextContent("Count: 3");
  },
} satisfies Story;
