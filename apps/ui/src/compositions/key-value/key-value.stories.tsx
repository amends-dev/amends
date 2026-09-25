import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column } from "@amends/ui/primitives/layout";
import { KeyValue } from "./index.ts";
function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean }) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Column style={{ padding: "1rem", "max-width": props.narrow ? "15rem" : "40rem" }}>
        <KeyValue.Root>
          <KeyValue.Row>
            <KeyValue.Label>Owner</KeyValue.Label>
            <KeyValue.Value>owner@example.test</KeyValue.Value>
          </KeyValue.Row>
          <KeyValue.Row>
            <KeyValue.Label>Member ID</KeyValue.Label>
            <KeyValue.Value>
              member-with-a-long-unbroken-identifier-that-needs-to-wrap
            </KeyValue.Value>
          </KeyValue.Row>
        </KeyValue.Root>
      </Column>
    </ThemeProvider>
  );
}
const meta = { title: "Compositions/KeyValue", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <>
      <Specimen />
      <Specimen theme="soot" />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
