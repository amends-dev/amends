import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { Skeleton } from "@amends/frontend/primitives/skeleton";
import { Text } from "@amends/frontend/primitives/text";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import "@amends/frontend/foundations/typography/fonts";

function Lines() {
  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "9px", "max-width": "440px" }}>
      <Skeleton style={{ width: "62%" }} data-testid="line-62" />
      <Skeleton style={{ width: "88%" }} data-testid="line-88" />
      <Skeleton style={{ width: "44%" }} data-testid="line-44" />
    </div>
  );
}

function Specimen(props: { theme: ColorTheme; surface: "canvas" | "panel" }) {
  return (
    <section
      class={colorThemes[props.theme]}
      aria-label={`${props.theme} skeleton on ${props.surface}`}
      style={{ padding: "1.5rem", "min-width": 0 }}
    >
      <div
        style={{
          padding: "1.25rem",
          "background-color": colorVars.surface[props.surface],
          "min-width": 0,
        }}
      >
        <Text as="h2" variant="mono" tone="secondary">
          First paint only · {props.theme} on {props.surface}
        </Text>
        <section style={{ "margin-top": "1rem" }} aria-busy="true" aria-label="Loading preview">
          <Lines />
        </section>
      </div>
    </section>
  );
}

const meta = {
  title: "Primitives/Skeleton",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    docs: {
      description: {
        component:
          "Static decorative bars for first paint, matching the Primitives v2 reference. Skeletons are hidden from assistive technology; the containing loading region owns its accessible name and busy state. Widths and arrangement belong to the caller.",
      },
    },
  },
  args: { theme: "cotton" as ColorTheme, surface: "panel" as "canvas" | "panel" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    surface: { control: "select", options: ["canvas", "panel"] },
  },
  render: (args) => <Specimen {...args} />,
} satisfies Meta<typeof Specimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reference = {} satisfies Story;
export const Comparison = {
  render: () => (
    <main
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 27rem), 1fr))",
      }}
    >
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <For each={["canvas", "panel"] as const}>
            {(surface) => <Specimen theme={theme} surface={surface} />}
          </For>
        )}
      </For>
    </main>
  ),
} satisfies Story;
export const Narrow = {
  render: (args) => (
    <div style={{ width: "200px", "max-width": "100%" }}>
      <Specimen {...args} />
    </div>
  ),
} satisfies Story;
