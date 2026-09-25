import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Input } from "@amends/ui/primitives/input";
import { Button } from "@amends/ui/primitives/button";
import "@amends/ui/foundations/typography/fonts";

function Fixture() {
  const [theme, setTheme] = createSignal<"cotton" | "soot">("cotton");
  return (
    <main>
      <ThemeProvider theme={theme()} data-testid="outer-theme">
        <Column gap={4}>
          <Text as="h1" variant="heading">
            Theme boundary
          </Text>
          <Input aria-label="Draft" />
          <Button onClick={() => setTheme(theme() === "cotton" ? "soot" : "cotton")}>
            Switch theme
          </Button>
          <ThemeProvider theme="soot" data-testid="inner-theme">
            <Text as="h2" variant="heading">
              Nested Soot
            </Text>
            <Text>This scope keeps its own theme when the outer theme changes.</Text>
          </ThemeProvider>
        </Column>
      </ThemeProvider>
    </main>
  );
}
const meta = { title: "Foundations/Theme", render: () => <Fixture /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Scope = {} satisfies Story;
export const Reactive = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Draft" });
    await userEvent.type(input, "Preserve this draft");
    await userEvent.click(canvas.getByRole("button", { name: "Switch theme" }));
    await expect(canvas.getByRole("textbox")).toBe(input);
    await expect(input).toHaveValue("Preserve this draft");
  },
} satisfies Story;
export const Inheritance = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      outer = canvas.getByTestId("outer-theme"),
      inner = canvas.getByTestId("inner-theme");
    await expect(getComputedStyle(outer).colorScheme).toBe("light");
    await expect(getComputedStyle(inner).colorScheme).toBe("dark");
    await expect(getComputedStyle(outer).fontFamily).toContain("IBM Plex Sans");
    await userEvent.click(canvas.getByRole("button", { name: "Switch theme" }));
    await expect(getComputedStyle(outer).colorScheme).toBe("dark");
    await expect(getComputedStyle(inner).colorScheme).toBe("dark");
  },
} satisfies Story;
