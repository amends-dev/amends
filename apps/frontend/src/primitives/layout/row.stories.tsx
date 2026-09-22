import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import {
  Row,
  Column,
  type LayoutAlign,
  type LayoutJustify,
} from "@amends/frontend/primitives/layout";
import { Button } from "@amends/frontend/primitives/button";
import { Text } from "@amends/frontend/primitives/text";
import { Themes, Cell, Frame } from "./layout.stories-support.tsx";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import type { SpaceStep } from "@amends/frontend/foundations/spacing";

function ComparisonSpecimen() {
  return (
    <Themes title="Row">
      {() => (
        <>
          <Text tone="secondary">
            Content-sized items flow horizontally and wrap when they run out of room.
          </Text>
          <Row gap={3} data-row="wrap">
            <Button>Save changes</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="ghost">View details</Button>
          </Row>
          <Row justify="between" align="start" gap={4}>
            <Column gap={1}>
              <Text>Workspace members</Text>
              <Text tone="secondary">Keep a heading and its context together.</Text>
            </Column>
            <Button variant="secondary">Invite member</Button>
          </Row>
          <Row align="end" gap={4} data-row="alignment">
            <Cell>Short</Cell>
            <Cell style={{ "padding-block": "2rem" }}>Taller content</Cell>
          </Row>
          <Text variant="mono">Wrapping inside a narrow panel</Text>
          <div style={{ width: "18rem", "max-width": "100%" }}>
            <Row gap={2} data-row="narrow">
              <Button variant="secondary">One action</Button>
              <Button variant="secondary">Another action</Button>
              <Button variant="secondary">A longer third action</Button>
            </Row>
          </div>
        </>
      )}
    </Themes>
  );
}
type Args = {
  theme: ColorTheme;
  gap: SpaceStep;
  align: LayoutAlign;
  justify: LayoutJustify;
  wrap: boolean;
};
const meta = {
  title: "Primitives/Layout/Row",
  render: (props: Args) => (
    <main>
      <Frame theme={props.theme} title="Row playground">
        <Row gap={props.gap} align={props.align} justify={props.justify} wrap={props.wrap}>
          <Cell>One</Cell>
          <Cell style={{ "padding-block": "2rem" }}>Taller content</Cell>
          <Cell>Three</Cell>
        </Row>
      </Frame>
    </main>
  ),
  args: { theme: "cotton", gap: 4, align: "center", justify: "start", wrap: true },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    gap: { control: "select", options: [0, 1, 2, 3, 4, 5, 6] },
    align: { control: "select", options: ["start", "center", "end", "stretch", "baseline"] },
    justify: { control: "select", options: ["start", "center", "end", "between"] },
    wrap: { control: "boolean" },
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
    for (const row of canvasElement.querySelectorAll<HTMLElement>('[data-row="narrow"]')) {
      const first = row.children[0]!.getBoundingClientRect(),
        last = row.children[2]!.getBoundingClientRect();
      await expect(last.top).toBeGreaterThan(first.top);
      await expect(last.right).toBeLessThanOrEqual(row.getBoundingClientRect().right + 1);
    }
    for (const row of canvasElement.querySelectorAll<HTMLElement>('[data-row="alignment"]')) {
      const first = row.children[0]!.getBoundingClientRect(),
        second = row.children[1]!.getBoundingClientRect();
      if (first.top < second.bottom && second.top < first.bottom)
        await expect(first.bottom).toBeCloseTo(second.bottom, 1);
    }
  },
} satisfies StoryObj<typeof meta>;
export const Playground = {} satisfies StoryObj<typeof meta>;
