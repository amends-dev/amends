import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeChoice, type ThemePreference } from "@amends/ui/features/appearance";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import "@amends/ui/foundations/typography/fonts";
function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean; disabled?: boolean }) {
  const [value, setValue] = createSignal<ThemePreference>("system");
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div style={{ padding: "1.5rem", "max-width": props.narrow ? "14rem" : "18.75rem" }}>
        <ThemeChoice value={value()} onValueChange={setValue} disabled={props.disabled} />
      </div>
    </ThemeProvider>
  );
}
const meta = {
  title: "Features/Appearance/Theme choice",
  render: () => <Specimen />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <>
      <Specimen />
      <Specimen theme="soot" />
      <Specimen disabled />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
export const EnlargedRTL = {
  render: () => (
    <div dir="rtl" style={{ zoom: 2 }}>
      <Specimen narrow />
    </div>
  ),
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("radio", { name: "System" })).toBeChecked();
    const cotton = canvas.getByRole("radio", { name: "Cotton" });
    await userEvent.click(canvas.getByText("Cotton"));
    await expect(cotton).toBeChecked();
    await userEvent.click(canvas.getByText("Soot"));
    await expect(canvas.getByRole("radio", { name: "Soot" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Cotton" })).toBe(cotton);
    await expect(canvas.getByText("Always use Soot.")).toBeVisible();
  },
} satisfies Story;
