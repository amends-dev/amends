import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Color from "colorjs.io";
import { colors } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import { Column } from "@amends/frontend/primitives/layout";
import "@amends/frontend/foundations/typography/fonts";

const meta = {
  title: "Foundations/Color/Avatar",
  tags: ["autodocs"],
  render: () => (
    <main>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <section class={colorThemes[theme]} style={{ padding: "1.5rem" }}>
            <Column gap={4}>
              <Text as="h2" variant="heading">
                {theme === "cotton" ? "Cotton" : "Soot"}
              </Text>
              <For each={["human", "contact", "system"] as const}>
                {(kind) => (
                  <Column gap={2}>
                    <Text as="h3" variant="mono">
                      avatar.{kind}
                    </Text>
                    <div
                      style={{
                        padding: "1rem",
                        "background-color": colorVars.avatar[kind].surface,
                        color: colorVars.avatar[kind].text,
                      }}
                    >
                      <Text>Readable fallback content</Text>
                    </div>
                    <Text as="p" variant="mono" style={{ "overflow-wrap": "anywhere" }}>
                      surface {colors[theme].avatar[kind].surface} · text{" "}
                      {colors[theme].avatar[kind].text} ·{" "}
                      {new Color(colors[theme].avatar[kind].text)
                        .contrastWCAG21(colors[theme].avatar[kind].surface)
                        .toFixed(2)}
                      :1
                    </Text>
                  </Column>
                )}
              </For>
              <Text as="p" tone="secondary">
                Agents use text.secondary and line.control on canvas or panel. Filled silhouettes
                are decorative; the name and kind convey identity.
              </Text>
            </Column>
          </section>
        )}
      </For>
    </main>
  ),
} satisfies Meta;
export default meta;
export const Comparison = {} satisfies StoryObj<typeof meta>;
