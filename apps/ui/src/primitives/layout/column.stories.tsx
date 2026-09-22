import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { Column, Row, type LayoutAlign, type LayoutJustify } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Text } from "@amends/ui/primitives/text";
import { Themes, Cell, Frame } from "./layout.stories-support.tsx";
import type { ColorTheme } from "@amends/ui/foundations/color";
import type { SpaceStep } from "@amends/ui/foundations/spacing";

function ComparisonSpecimen() {
  return (
    <Themes title="Column">
      {() => (
        <>
          <Text tone="secondary">
            Vertical groups stretch their children by default. Gaps belong to the group.
          </Text>
          <Column gap={4} data-column="stretch">
            <Cell>First block</Cell>
            <Cell>Second block with more text</Cell>
            <Cell>Third block</Cell>
          </Column>
          <Column gap={2} align="start" data-column="start">
            <Text as="h3">Keep related content together</Text>
            <Text tone="secondary">An inner column can use a smaller gap than its parent.</Text>
            <Row gap={2}>
              <Button>Continue</Button>
              <Button variant="ghost">Learn more</Button>
            </Row>
          </Column>
          <Column justify="between" style={{ "min-height": "10rem" }} data-column="between">
            <Text>At the beginning</Text>
            <Text>At the end</Text>
          </Column>
        </>
      )}
    </Themes>
  );
}
type Args = { theme: ColorTheme; gap: SpaceStep; align: LayoutAlign; justify: LayoutJustify };
const meta = {
  title: "Primitives/Layout/Column",
  render: (props: Args) => (
    <main>
      <Frame theme={props.theme} title="Column playground">
        <Column
          gap={props.gap}
          align={props.align}
          justify={props.justify}
          style={{ "min-height": "20rem" }}
        >
          <Cell>One</Cell>
          <Cell>A wider block of content</Cell>
          <Cell>Three</Cell>
        </Column>
      </Frame>
    </main>
  ),
  args: { theme: "cotton", gap: 4, align: "stretch", justify: "start" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    gap: { control: "select", options: [0, 1, 2, 3, 4, 5, 6] },
    align: { control: "select", options: ["start", "center", "end", "stretch", "baseline"] },
    justify: { control: "select", options: ["start", "center", "end", "between"] },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
export const Comparison = {
  name: "Comparison",
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const column of canvasElement.querySelectorAll<HTMLElement>('[data-column="stretch"]')) {
      const first = column.children[0]!.getBoundingClientRect(),
        second = column.children[1]!.getBoundingClientRect();
      await expect(second.top - first.bottom).toBeCloseTo(root, 1);
      await expect(first.width).toBeCloseTo(column.getBoundingClientRect().width, 1);
    }
  },
} satisfies StoryObj<typeof meta>;
export const Playground = {} satisfies StoryObj<typeof meta>;
