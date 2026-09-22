import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import Color from "colorjs.io";
import { colors, type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import { Text } from "@amends/ui/primitives/text";
import "@amends/ui/foundations/typography/fonts";
import { compositeOnSurface } from "./contrast.ts";
import * as s from "./actions.stories.css.ts";

const cases = {
  filled: { label: "Filled · default", background: "fill", text: "onFill", border: null },
  filledHover: { label: "Filled · hover", background: "fillHover", text: "onFill", border: null },
  filledPressed: {
    label: "Filled · pressed",
    background: "fillPressed",
    text: "onFill",
    border: null,
  },
  outlined: { label: "Outlined · default", background: null, text: "text", border: "border" },
  outlinedHover: {
    label: "Outlined · hover",
    background: "hover",
    text: "text",
    border: "borderStrong",
  },
  outlinedPressed: {
    label: "Outlined · pressed",
    background: "pressed",
    text: "text",
    border: "borderStrong",
  },
} as const;
function DangerSpecimen(props: { theme: ColorTheme }) {
  const palette = () => colors[props.theme].action.danger;
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-danger-theme={props.theme}
    >
      <Text as="h2" variant="heading">
        {props.theme === "cotton" ? "Cotton" : "Soot"} danger actions
      </Text>
      <Text tone="secondary">
        Static color pairs for destructive actions. Ghost uses the outlined text and hover/pressed
        fills without a border. Disabled appearance and focus stay shared with neutral actions.
      </Text>
      <For each={["canvas", "panel"] as const}>
        {(surface) => (
          <section
            class={`${s.surface} ${s.stack}`}
            data-danger-surface={surface}
            style={{ "background-color": colorVars.surface[surface] }}
          >
            <Text as="h3">On surface.{surface}</Text>
            <div class={s.states}>
              <For each={Object.entries(cases)}>
                {([name, specimen]) => (
                  <figure class={`${s.figure} ${s.stack}`}>
                    <Text>{specimen.label}</Text>
                    <div
                      class={s.sample}
                      data-danger-case={name}
                      style={{
                        color: colorVars.action.danger[specimen.text],
                        "background-color": specimen.background
                          ? colorVars.action.danger[specimen.background]
                          : "transparent",
                        border: `1px ${specimen.border ? "dashed" : "solid"} ${specimen.border ? colorVars.action.danger[specimen.border] : "transparent"}`,
                      }}
                    >
                      <Text as="span" variant="mono">
                        Delete thread
                      </Text>
                    </div>
                    <figcaption>
                      <Text variant="mono" tone="secondary">
                        {specimen.text} · {palette()[specimen.text]}
                      </Text>
                      <Text variant="mono" tone="secondary">
                        {specimen.background ?? "transparent"}{" "}
                        {specimen.background ? `· ${palette()[specimen.background]}` : ""}
                      </Text>
                      {specimen.border && (
                        <Text variant="mono" tone="secondary">
                          {specimen.border} · {palette()[specimen.border]}
                        </Text>
                      )}
                    </figcaption>
                  </figure>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </article>
  );
}
const meta = {
  title: "Foundations/Color/Danger actions",
  component: DangerSpecimen,
  render: (props) => (
    <main>
      <DangerSpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  parameters: { layout: "fullscreen" as const, dangerSampleCount: 12 },
  tags: ["autodocs"],
  play: async ({ canvasElement, parameters }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const samples = canvasElement.querySelectorAll<HTMLElement>("[data-danger-case]");
    await expect(samples).toHaveLength(parameters.dangerSampleCount);
    if (window.matchMedia("(forced-colors: active)").matches) return;
    for (const sample of samples) {
      const theme = sample.closest<HTMLElement>("[data-danger-theme]")!.dataset
        .dangerTheme as ColorTheme;
      const palette = colors[theme].action.danger;
      const specimen = cases[sample.dataset.dangerCase as keyof typeof cases];
      const rendered = getComputedStyle(sample);
      const backdrop = getComputedStyle(
        sample.closest<HTMLElement>("[data-danger-surface]")!,
      ).backgroundColor;
      const text = new Color(getComputedStyle(sample.firstElementChild!).color);
      const background = new Color(rendered.backgroundColor);
      const expectedFill = new Color(
        specimen.background ? palette[specimen.background] : "transparent",
      );
      await expect(text.deltaEOK(palette[specimen.text])).toBeLessThan(0.0001);
      await expect(background.alpha).toBeCloseTo(expectedFill.alpha, 6);
      if (specimen.background) await expect(background.deltaEOK(expectedFill)).toBeLessThan(0.0001);
      const effective = compositeOnSurface(rendered.backgroundColor, backdrop);
      await expect(text.contrastWCAG21(effective)).toBeGreaterThanOrEqual(4.5);
      if (specimen.border) {
        const border = new Color(rendered.borderTopColor);
        await expect(border.deltaEOK(palette[specimen.border])).toBeLessThan(0.0001);
        await expect(border.contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
        await expect(border.contrastWCAG21(backdrop)).toBeGreaterThanOrEqual(3);
      }
    }
  },
} satisfies Meta<typeof DangerSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <main class={s.comparison}>
      <DangerSpecimen theme="cotton" />
      <DangerSpecimen theme="soot" />
    </main>
  ),
  parameters: { dangerSampleCount: 24, controls: { disable: true } },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
