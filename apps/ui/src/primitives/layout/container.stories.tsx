import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { Container, Column, type LayoutLength } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Themes, Cell, Frame } from "./layout.stories-support.tsx";
import type { ColorTheme } from "@amends/ui/foundations/color";
import type { SpaceStep } from "@amends/ui/foundations/spacing";
import * as s from "./layout.stories.css.ts";

const widths = ["30rem", "67.5rem", "none"] as const;
function ComparisonSpecimen() {
  return (
    <Themes title="Container">
      {() => (
        <>
          <Text tone="secondary">
            Centered content with a maximum outer width and spacing-scale gutters.
          </Text>
          <For each={widths}>
            {(maxWidth) => (
              <Column gap={2}>
                <Text variant="mono">maxWidth={maxWidth} · gutter=4</Text>
                <div class={s.boundary}>
                  <Container maxWidth={maxWidth} gutter={4} data-container-width={maxWidth}>
                    <Cell>Content stays inside the container’s 1rem inline gutters.</Cell>
                  </Container>
                </div>
              </Column>
            )}
          </For>
          <Container gutter={0} maxWidth="none" data-container-flush>
            <Cell>gutter=0 · a flush container for an already padded panel</Cell>
          </Container>
        </>
      )}
    </Themes>
  );
}
type Args = { theme: ColorTheme; maxWidth: LayoutLength | "none"; gutter: SpaceStep };
const meta = {
  title: "Primitives/Layout/Container",
  render: (props: Args) => (
    <main>
      <Frame theme={props.theme} title="Container playground">
        <div class={s.boundary}>
          <Container maxWidth={props.maxWidth} gutter={props.gutter}>
            <Cell>Container content</Cell>
          </Container>
        </div>
      </Frame>
    </main>
  ),
  args: { theme: "cotton", maxWidth: "30rem", gutter: 4 },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    maxWidth: { control: "select", options: widths },
    gutter: { control: "select", options: [0, 1, 2, 3, 4, 5, 6] },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  name: "Comparison",
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const container of canvasElement.querySelectorAll<HTMLElement>("[data-container-width]")) {
      const width = container.dataset.containerWidth as LayoutLength | "none";
      const available = container.parentElement!.getBoundingClientRect().width;
      const expected =
        width === "none" ? available : Math.min(available, Number.parseFloat(width) * root);
      const box = container.getBoundingClientRect(),
        child = container.firstElementChild!.getBoundingClientRect();
      await expect(box.width).toBeCloseTo(expected, 1);
      await expect(child.left - box.left).toBeCloseTo(root, 1);
      await expect(box.right - child.right).toBeCloseTo(root, 1);
      const parent = container.parentElement!.getBoundingClientRect();
      await expect(box.left - parent.left).toBeCloseTo(parent.right - box.right, 1);
    }
  },
} satisfies Story;
export const Playground = {} satisfies Story;
