import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, Show, type ParentProps } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Button } from "@amends/ui/primitives/button";
import { Status } from "@amends/ui/primitives/status";
import { KeyValue } from "@amends/ui/compositions/key-value";

function Frame(props: ParentProps<{ theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }>) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column style={{ padding: "1.5rem", "max-width": props.narrow ? "20rem" : "33.75rem" }}>
        <Column
          gap={3}
          style={{
            background: colorVars.surface.panel,
            padding: "1.375rem",
            "border-radius": "0.875rem",
          }}
        >
          <Text
            variant="mono"
            tone="secondary"
            style={{
              "font-size": "0.65625rem",
              "letter-spacing": "0.09em",
              "text-transform": "uppercase",
            }}
          >
            Key and value
          </Text>
          {props.children}
        </Column>
      </Column>
    </ThemeProvider>
  );
}
function ReferenceSpecimen(props: { theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }) {
  return (
    <Frame {...props}>
      <KeyValue.Root aria-label="Run metadata">
        <KeyValue.Row>
          <KeyValue.Label>model</KeyValue.Label>
          <KeyValue.Value>claude-sonnet-4-6</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>environment</KeyValue.Label>
          <KeyValue.Value>sandbox · node 22</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>tokens</KeyValue.Label>
          <KeyValue.Value>18,204 in · 2,911 out</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>cost</KeyValue.Label>
          <KeyValue.Value>$0.19</KeyValue.Value>
        </KeyValue.Row>
      </KeyValue.Root>
    </Frame>
  );
}
function LongContentSpecimen() {
  return (
    <Frame narrow>
      <KeyValue.Root aria-label="Long metadata">
        <KeyValue.Row>
          <KeyValue.Label>workspace</KeyValue.Label>
          <KeyValue.Value>A workspace name that spans more than one line</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>identifier</KeyValue.Label>
          <KeyValue.Value>
            workspace-0123456789abcdef0123456789abcdef0123456789abcdef
          </KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>A descriptive key that also needs to wrap</KeyValue.Label>
          <KeyValue.Value>0</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>last run</KeyValue.Label>
          <KeyValue.Value>Not yet run</KeyValue.Value>
        </KeyValue.Row>
      </KeyValue.Root>
    </Frame>
  );
}
function ComposedSpecimen() {
  const [complete, setComplete] = createSignal(false),
    [detail, setDetail] = createSignal(true);
  return (
    <Frame>
      <KeyValue.Root aria-label="Composed metadata">
        <KeyValue.Row>
          <KeyValue.Label>state</KeyValue.Label>
          <KeyValue.Value>
            <Status.Root tone={complete() ? "success" : "running"}>
              <Status.Indicator />
              <Status.Label>{complete() ? "Succeeded" : "Working"}</Status.Label>
            </Status.Root>
          </KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>review</KeyValue.Label>
          <KeyValue.Value>
            <Button variant="secondary" onClick={() => setComplete(!complete())}>
              {complete() ? "Reopen" : "Mark complete"}
            </Button>
          </KeyValue.Value>
        </KeyValue.Row>
        <Show when={detail()}>
          <KeyValue.Row>
            <KeyValue.Label>note</KeyValue.Label>
            <KeyValue.Value>
              <Column gap={1}>
                <span>First line of the description.</span>
                <span>Additional context stays in the same value.</span>
              </Column>
            </KeyValue.Value>
          </KeyValue.Row>
        </Show>
      </KeyValue.Root>
      <Row>
        <Button variant="ghost" onClick={() => setDetail(!detail())}>
          {detail() ? "Hide note" : "Show note"}
        </Button>
      </Row>
    </Frame>
  );
}
const meta = { title: "Compositions/KeyValue", render: () => <ReferenceSpecimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <ReferenceSpecimen />
      <ReferenceSpecimen theme="soot" />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <ReferenceSpecimen narrow /> } satisfies Story;
export const LongContent = { render: () => <LongContentSpecimen /> } satisfies Story;
export const RTL = { render: () => <ReferenceSpecimen rtl /> } satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <LongContentSpecimen />
    </div>
  ),
} satisfies Story;
export const ComposedValues = {
  render: () => <ComposedSpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Mark complete" });
    await userEvent.click(button);
    await expect(canvas.getByText("Succeeded")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Reopen" })).toBe(button);
    await expect(button).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Hide note" }));
    await expect(canvas.queryByText("note")).not.toBeInTheDocument();
  },
} satisfies Story;
