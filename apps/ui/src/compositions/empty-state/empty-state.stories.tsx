import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, type ParentProps } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { EmptyState } from "@amends/ui/compositions/empty-state";

function Frame(props: ParentProps<{ theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }>) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        style={{
          margin: "1.5rem",
          "max-width": props.narrow ? "17.5rem" : "22rem",
          background: colorVars.surface.panel,
          "border-radius": "0.875rem",
          padding: "2.25rem 1.5rem 2rem",
        }}
      >
        {props.children}
      </Column>
    </ThemeProvider>
  );
}
/** Primitives v2, "Drawings, in place": the failure specimen. */
function Failure(props: { theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }) {
  return (
    <Frame {...props}>
      <EmptyState.Root>
        <Drawing.Snapped />
        <EmptyState.Text>
          <EmptyState.Title>The run failed</EmptyState.Title>
          <EmptyState.Description>
            Turn 3 stopped after the test suite came back red. The session log is kept.
          </EmptyState.Description>
        </EmptyState.Text>
        <EmptyState.Actions>
          <Button>Try again</Button>
          <Button variant="secondary">Open log</Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </Frame>
  );
}
function Empty(props: { theme?: "cotton" | "soot" }) {
  return (
    <Frame {...props}>
      <EmptyState.Root>
        <Drawing.Bare />
        <EmptyState.Text>
          <EmptyState.Title>No results</EmptyState.Title>
          <EmptyState.Description>Nothing matches these filters.</EmptyState.Description>
        </EmptyState.Text>
        <EmptyState.Actions>
          <Button variant="secondary">Clear filters</Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </Frame>
  );
}
function Recovery() {
  const [attempts, setAttempts] = createSignal(0);
  return (
    <Frame>
      <EmptyState.Root>
        <Drawing.Disconnected />
        <EmptyState.Text>
          <EmptyState.Title>Can’t reach the host</EmptyState.Title>
          <EmptyState.Description role="status">
            {attempts() === 0 ? "You’re still signed in." : `Tried ${attempts()} more times.`}
          </EmptyState.Description>
        </EmptyState.Text>
        <EmptyState.Actions>
          <Button onClick={() => setAttempts(attempts() + 1)}>Try again</Button>
        </EmptyState.Actions>
      </EmptyState.Root>
    </Frame>
  );
}
const meta = { title: "Compositions/EmptyState", render: () => <Failure /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {} satisfies Story;
export const Comparison = {
  render: () => (
    <Row align="start">
      <Failure />
      <Empty />
      <Failure theme="soot" />
      <Empty theme="soot" />
    </Row>
  ),
} satisfies Story;
export const Narrow = { render: () => <Failure narrow /> } satisfies Story;
export const RTL = { render: () => <Failure rtl /> } satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Failure narrow />
    </div>
  ),
} satisfies Story;
export const ReactiveRecovery = {
  render: () => <Recovery />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole("status");
    const button = canvas.getByRole("button", { name: "Try again" });
    await userEvent.click(button);
    await expect(status).toHaveTextContent("Tried 1 more times.");
    await expect(canvas.getByRole("status")).toBe(status);
    await expect(button).toHaveFocus();
  },
} satisfies Story;
