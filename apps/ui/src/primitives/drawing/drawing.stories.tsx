import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Row, Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Drawing } from "@amends/ui/primitives/drawing";

const subjects = [
  { name: "Disconnected", Component: Drawing.Disconnected, note: "a lost connection" },
  { name: "Snapped", Component: Drawing.Snapped, note: "a failure" },
  { name: "Bare", Component: Drawing.Bare, note: "nothing here" },
] as const;
function Specimens(props: { theme?: "cotton" | "soot"; panel?: boolean }) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Row
        gap={6}
        style={{
          padding: "1.5rem",
          background: props.panel ? colorVars.surface.panel : undefined,
        }}
      >
        {subjects.map((subject) => (
          <Column gap={2} align="center">
            <subject.Component label={`${subject.name}: ${subject.note}`} />
            <Text variant="mono" tone="secondary">
              {subject.name}
            </Text>
          </Column>
        ))}
      </Row>
    </ThemeProvider>
  );
}
const meta = { title: "Primitives/Drawing", render: () => <Specimens /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {} satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <Specimens />
      <Specimens panel />
      <Specimens theme="soot" />
      <Specimens theme="soot" panel />
    </>
  ),
} satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Specimens />
    </div>
  ),
} satisfies Story;
