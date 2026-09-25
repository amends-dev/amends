import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, For } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column, Row } from "@amends/ui/primitives/layout";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { FilterChip } from "./index.ts";
function Example(props: { theme?: "cotton" | "soot"; narrow?: boolean; disabled?: boolean }) {
  const [selected, setSelected] = createSignal(["agents"]);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Column
        gap={3}
        style={{
          padding: "1.5rem",
          background: colorVars.surface.panel,
          "max-width": props.narrow ? "13rem" : "none",
        }}
      >
        <Row gap={2} role="group" aria-label="Filters">
          <For each={["agents", "needs you", "running", "settled", "archived"]}>
            {(label) => (
              <FilterChip
                pressed={selected().includes(label)}
                disabled={props.disabled}
                onPressedChange={(pressed) =>
                  setSelected((values) =>
                    pressed ? [...values, label] : values.filter((value) => value !== label),
                  )
                }
              >
                {label}
              </FilterChip>
            )}
          </For>
        </Row>
        <output aria-label="Selected filters">{selected().join(" · ") || "no filters"}</output>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Primitives/FilterChip", render: () => <Example /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <Example />
      <Example theme="soot" />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Example narrow /> } satisfies Story;
export const Disabled = {
  render: () => (
    <>
      <Example disabled />
      <Example theme="soot" disabled />
    </>
  ),
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "needs you" }));
    await expect(canvas.getByRole("button", { name: "agents" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(canvas.getByRole("button", { name: "needs you" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.keyboard(" ");
    await expect(canvas.getByRole("button", { name: "needs you" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(canvas.getByRole("button", { name: "agents" }));
    await expect(canvas.getByLabelText("Selected filters")).toHaveTextContent("no filters");
  },
} satisfies Story;
