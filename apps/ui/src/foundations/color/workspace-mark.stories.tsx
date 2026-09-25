import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { For } from "solid-js";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import { Text } from "@amends/ui/primitives/text";
const meta = {
  title: "Foundations/Color/Workspace mark",
  render: () => (
    <For each={["cotton", "soot"] as const}>
      {(theme) => (
        <section class={colorThemes[theme]} style={{ padding: "2rem" }}>
          <Text>{theme} · branded workspace identity</Text>
          <span
            style={{
              display: "inline-block",
              padding: "1rem",
              "background-color": colorVars.workspaceMark.surface,
              color: colorVars.workspaceMark.text,
            }}
          >
            Aa · Workspace mark
          </span>
        </section>
      )}
    </For>
  ),
} satisfies Meta;
export default meta;
export const Comparison = {} satisfies StoryObj<typeof meta>;
