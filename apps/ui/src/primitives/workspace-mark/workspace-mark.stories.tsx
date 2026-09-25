import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { For } from "solid-js";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import "@amends/ui/foundations/typography/fonts";

const meta = {
  title: "Primitives/WorkspaceMark",
  render: () => (
    <For each={["cotton", "soot"] as const}>
      {(theme) => (
        <ThemeProvider theme={theme}>
          <Row gap={4} style={{ padding: "1.5rem" }}>
            <WorkspaceMark decorative>H</WorkspaceMark>
            <Text>Home</Text>
            <WorkspaceMark aria-label="Mercier & Co">M</WorkspaceMark>
            <WorkspaceMark aria-label="Unnamed workspace"> </WorkspaceMark>
          </Row>
        </ThemeProvider>
      )}
    </For>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {} satisfies Story;
export const Enlarged = {
  render: () => (
    <ThemeProvider theme="cotton">
      <Row dir="rtl" style={{ padding: "2rem", zoom: 2 }}>
        <WorkspaceMark decorative>م</WorkspaceMark>
        <Text>مساحة العمل</Text>
      </Row>
    </ThemeProvider>
  ),
} satisfies Story;
