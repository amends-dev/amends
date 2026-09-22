import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Color from "colorjs.io";
import { colors } from "@amends/ui/foundations/color";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import { Text } from "@amends/ui/primitives/text";
import { Column } from "@amends/ui/primitives/layout";
import "@amends/ui/foundations/typography/fonts";
const meta = {
  title: "Foundations/Color/Toast",
  tags: ["autodocs"],
  render: () => (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Column gap={3}>
              <Text as="h2" variant="heading">
                {theme === "cotton" ? "Cotton" : "Soot"}
              </Text>
              <div
                style={{
                  padding: "1rem",
                  "background-color": colorVars.toast.surface,
                  color: colorVars.toast.text,
                }}
              >
                <Text tone="inherit">Toast text, close control, and focus ring.</Text>
                <Text as="p" tone="inherit" style={{ color: colorVars.toast.action }}>
                  Toast action — dashed underline.
                </Text>
              </div>
              <For each={["text", "action"] as const}>
                {(role) => (
                  <Text as="p" variant="mono">
                    toast.{role}: {colors[theme].toast[role]} ·{" "}
                    {new Color(colors[theme].toast[role])
                      .contrastWCAG21(colors[theme].toast.surface)
                      .toFixed(2)}
                    :1 on toast.surface ({colors[theme].toast.surface})
                  </Text>
                )}
              </For>
            </Column>
          </section>
        )}
      </For>
    </main>
  ),
} satisfies Meta;
export default meta;
export const Comparison = {} satisfies StoryObj<typeof meta>;
