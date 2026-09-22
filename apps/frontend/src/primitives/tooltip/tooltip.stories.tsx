import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Tooltip } from "@amends/frontend/primitives/tooltip";
import { IconButton } from "@amends/frontend/primitives/icon-button";
import { Button } from "@amends/frontend/primitives/button";
import { Row } from "@amends/frontend/primitives/layout";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
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
