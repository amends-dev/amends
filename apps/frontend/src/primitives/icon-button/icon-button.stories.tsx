import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import type { ButtonTone } from "@amends/frontend/primitives/button";
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
function ComparisonSpecimen(props: { tone?: ButtonTone }) {
  return (
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
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label={props.tone === "danger" ? "Delete thread" : "Add member"}
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "plus"} />
                  </IconButton>
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label={props.tone === "danger" ? "Delete draft" : "Search"}
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "search"} />
                  </IconButton>
                  <IconButton
                    variant={variant}
                    tone={props.tone}
                    aria-label="Unavailable action"
                    disabled
                  >
                    <DemoIcon name={props.tone === "danger" ? "trash" : "bell"} />
                  </IconButton>
                </Row>
              )}
            </For>
          </Column>
        )}
      </For>
    </main>
  );
}
export const Comparison = { render: () => <ComparisonSpecimen /> } satisfies Story;
export const DangerComparison = {
  render: () => <ComparisonSpecimen tone="danger" />,
} satisfies Story;
function Counter(props: { tone?: ButtonTone }) {
  const [count, setCount] = createSignal(0);
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem" }}>
      <Row>
        <IconButton
          tone={props.tone}
          aria-label={props.tone === "danger" ? "Delete draft" : "Add one"}
          onClick={() => setCount((n) => n + 1)}
        >
          <DemoIcon name={props.tone === "danger" ? "trash" : "plus"} />
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

export const DangerInteraction = {
  render: () => <Counter tone="danger" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Delete draft" }));
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("status")).toHaveTextContent("Count: 3");
  },
} satisfies Story;
