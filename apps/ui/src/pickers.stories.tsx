import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, For, type ParentProps } from "solid-js";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Column, Row, Grid } from "@amends/ui/primitives/layout";
import { Divider } from "@amends/ui/primitives/divider";
import { Text } from "@amends/ui/primitives/text";
import { Select } from "@amends/ui/primitives/select";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { SegmentedControl } from "./compositions/segmented-control/index.ts";
import { FilterChip } from "./primitives/filter-chip/index.ts";
import { Assignee } from "./primitives/combobox/combobox.stories-support.tsx";
function Caption(props: ParentProps) {
  return (
    <Text
      variant="mono"
      tone="secondary"
      style={{
        "font-size": "0.65625rem",
        "letter-spacing": "0.09em",
        "text-transform": "uppercase",
      }}
    >
      {props.children}
    </Text>
  );
}
function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }) {
  const [segment, setSegment] = createSignal("for you"),
    [filters, setFilters] = createSignal(["agents"]);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        gap={5}
        style={{ padding: "1.5rem", "max-width": props.narrow ? "19rem" : "62.5rem" }}
      >
        <Text as="h1" variant="heading">
          Filters and pickers
        </Text>
        <Column
          gap={5}
          style={{
            background: colorVars.surface.panel,
            padding: "1.5rem 1.375rem",
            "border-radius": "0.875rem",
          }}
        >
          <Column gap={3}>
            <Caption>Segmented</Caption>
            <SegmentedControl.Root aria-label="Show" value={segment()} onValueChange={setSegment}>
              <For each={["for you", "everything", "agents"]}>
                {(label) => <SegmentedControl.Item value={label}>{label}</SegmentedControl.Item>}
              </For>
            </SegmentedControl.Root>
          </Column>
          <Divider.Line />
          <Column gap={3}>
            <Caption>Filter chips · {filters().join(" · ") || "no filters"}</Caption>
            <Row gap={2} role="group" aria-label="Filters">
              <For each={["agents", "needs you", "running", "settled", "archived"]}>
                {(label) => (
                  <FilterChip
                    pressed={filters().includes(label)}
                    onPressedChange={(pressed) =>
                      setFilters((values) =>
                        pressed ? [...values, label] : values.filter((value) => value !== label),
                      )
                    }
                  >
                    {label}
                  </FilterChip>
                )}
              </For>
            </Row>
          </Column>
          <Divider.Line />
          <Grid minColumnWidth="14.375rem" gap={5} maxColumns={2}>
            <Column gap={3}>
              <Caption>Select</Caption>
              <Select
                aria-label="Model"
                defaultValue="claude-sonnet-4-6"
                options={["claude-sonnet-4-6", "claude-opus-4-1", "gpt-5-codex"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Column>
            <Column gap={3}>
              <Assignee label="Combobox · type to filter" description="" clearOnSelect />
            </Column>
          </Grid>
        </Column>
      </Column>
    </ThemeProvider>
  );
}
const meta = {
  title: "Primitives/Filters and pickers",
  render: () => <Specimen />,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Soot = { render: () => <Specimen theme="soot" /> } satisfies Story;
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
export const EnlargedRTL = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Specimen narrow rtl />
    </div>
  ),
} satisfies Story;
