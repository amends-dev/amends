import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { SegmentedControl } from "./index.ts";
function Example(props: {
  theme?: "cotton" | "soot";
  narrow?: boolean;
  disabled?: boolean;
  rtl?: boolean;
}) {
  const [value, setValue] = createSignal("for-you");
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        gap={3}
        style={{
          padding: "1.5rem",
          background: colorVars.surface.panel,
          "max-width": props.narrow ? "13rem" : "none",
        }}
      >
        <SegmentedControl.Root
          aria-label="Show"
          value={value()}
          onValueChange={setValue}
          disabled={props.disabled}
        >
          <SegmentedControl.Item value="for-you">for you</SegmentedControl.Item>
          <SegmentedControl.Item value="everything">everything</SegmentedControl.Item>
          <SegmentedControl.Item value="agents">agents</SegmentedControl.Item>
        </SegmentedControl.Root>
        <output aria-label="Selected view">{value()}</output>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/SegmentedControl", render: () => <Example /> } satisfies Meta;
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
export const Disabled = {
  render: () => (
    <>
      <Example disabled />
      <Example theme="soot" disabled />
    </>
  ),
} satisfies Story;
export const NarrowRTL = { render: () => <Example narrow rtl /> } satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "everything" }));
    await expect(canvas.getByRole("radio", { name: "everything" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "for you" })).not.toBeChecked();
    await expect(canvas.getByLabelText("Selected view")).toHaveTextContent("everything");
  },
} satisfies Story;
