import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import Color from "colorjs.io";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import "@amends/frontend/foundations/typography/fonts";
import { compositeOnSurface } from "./contrast.ts";
import * as s from "./controls.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const specimens = {
  control: { label: "Default border", line: "control", overlay: null },
  strong: { label: "Strong border", line: "strong", overlay: null },
  hover: { label: "Hover background", line: "strong", overlay: "hover" },
  pressed: { label: "Pressed background", line: "strong", overlay: "pressed" },
} as const;
const cases = ["control", "strong", "hover", "pressed"] as const;
type Case = keyof typeof specimens;
type Surface = "canvas" | "panel";

function Pairings(props: { theme: ColorTheme; surface: Surface }) {
  const palette = () => colors[props.theme];
  return (
    <section
      class={`${s.surface} ${s.stack}`}
      style={{ "background-color": colorVars.surface[props.surface] }}
      data-control-surface={props.surface}
    >
      <Text as="h3">On surface.{props.surface}</Text>
      <div class={s.cases}>
        <For each={cases}>
          {(name) => {
            const specimen = specimens[name];
            const effective = () =>
              compositeOnSurface(
                specimen.overlay ? palette().action[specimen.overlay] : "transparent",
                palette().surface[props.surface],
              );
            return (
              <figure class={`${s.figure} ${s.stack}`}>
                <Text>{specimen.label}</Text>
                <div
                  class={s.sample}
                  data-control-case={name}
                  style={{
                    "border-color": colorVars.line[specimen.line],
                    "background-color": specimen.overlay
                      ? colorVars.action[specimen.overlay]
                      : "transparent",
                  }}
                >
                  <Text as="span" variant="mono">
                    Save draft
                  </Text>
                </div>
                <figcaption>
                  <Text variant="mono">
                    {specimen.overlay ? `action.${specimen.overlay}` : `line.${specimen.line}`}
                  </Text>
                  <Text variant="mono" tone="secondary">
                    {specimen.overlay
                      ? palette().action[specimen.overlay]
                      : palette().line[specimen.line]}
                  </Text>
                  <Text tone="secondary">
                    {new Color(palette().line[specimen.line])
                      .contrastWCAG21(effective())
                      .toFixed(2)}
                    :1 border contrast
                  </Text>
                  {specimen.overlay && (
                    <>
                      <Text tone="secondary">
                        {new Color(palette().text.primary).contrastWCAG21(effective()).toFixed(2)}:1
                        text contrast
                      </Text>
                      <Text variant="mono" tone="secondary">
                        line.strong border
                      </Text>
                    </>
                  )}
                </figcaption>
              </figure>
            );
          }}
        </For>
      </div>
    </section>
  );
}

function ControlSpecimen(props: { theme: ColorTheme; children?: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-control-theme={props.theme}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <Text tone="secondary">
        Control borders and subtle backgrounds. Static color pairings for review.
      </Text>
      <Pairings theme={props.theme} surface="canvas" />
      <Pairings theme={props.theme} surface="panel" />
      <Text tone="secondary">
        Minimum contrast: 3:1 for borders, 4.5:1 for text. Translucent fills are measured after
        blending with each surface. Use line.strong with these filled specimens.
      </Text>
      {props.children}
    </article>
  );
}

function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <ControlSpecimen theme="cotton" />
      <ControlSpecimen theme="soot" />
    </main>
  );
}

function EnlargedControls() {
  onMount(() => {
    const root = document.documentElement.style;
    const previous = root.getPropertyValue("font-size");
    const priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (previous) root.setProperty("font-size", previous, priority);
      else root.removeProperty("font-size");
    });
  });
  return <ComparisonSpecimen />;
}

const verifyControls: NonNullable<StoryObj["play"]> = async ({
  canvasElement,
  parameters,
  step,
}) => {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  const samples = canvasElement.querySelectorAll<HTMLElement>("[data-control-case]");
  await expect(samples).toHaveLength(parameters.controlSampleCount);
  // User-selected forced colors replace author colors. Review those visually instead of asserting token equality.
  if (doc.defaultView!.matchMedia("(forced-colors: active)").matches) return;
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true })!;
  await step("Verify actual scoped colors and composited contrast", async () => {
    for (const sample of samples) {
      const theme = sample.closest<HTMLElement>("[data-control-theme]")!.dataset
        .controlTheme as ColorTheme;
      const surface = sample.closest<HTMLElement>("[data-control-surface]")!;
      const palette = colors[theme];
      const specimen = specimens[sample.dataset.controlCase as Case];
      const rendered = getComputedStyle(sample);
      const backdrop = getComputedStyle(surface).backgroundColor;
      const source = new Color(rendered.backgroundColor);
      const text = new Color(getComputedStyle(sample.firstElementChild!).color);
      await expect(
        new Color(backdrop).deltaEOK(palette.surface[surface.dataset.controlSurface as Surface]),
      ).toBeLessThan(0.0001);
      await expect(new Color(backdrop).alpha).toBe(1);
      await expect(text.deltaEOK(palette.text.primary)).toBeLessThan(0.0001);
      await expect(text.alpha).toBe(1);
      await expect(rendered.opacity).toBe("1");
      const expectedFill = new Color(
        specimen.overlay ? palette.action[specimen.overlay] : "transparent",
      );
      await expect(source.alpha).toBeCloseTo(expectedFill.alpha, 6);
      if (specimen.overlay) await expect(source.deltaEOK(expectedFill)).toBeLessThan(0.0001);
      const effective = compositeOnSurface(rendered.backgroundColor, backdrop);
      await expect(text.contrastWCAG21(effective)).toBeGreaterThanOrEqual(4.5);
      for (const color of [
        rendered.borderTopColor,
        rendered.borderRightColor,
        rendered.borderBottomColor,
        rendered.borderLeftColor,
      ]) {
        const border = new Color(color);
        await expect(border.deltaEOK(palette.line[specimen.line])).toBeLessThan(0.0001);
        await expect(border.alpha).toBe(1);
        await expect(border.contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
        await expect(border.contrastWCAG21(backdrop)).toBeGreaterThanOrEqual(3);
      }
      // Independently compare the blend calculation with the browser's sRGB canvas compositing.
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = backdrop;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = rendered.backgroundColor;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      await expect(pixel).toHaveLength(4);
      for (const index of [0, 1, 2] as const) {
        await expect(Math.abs(pixel[index]! / 255 - effective.coords[index]!)).toBeLessThanOrEqual(
          2 / 255,
        );
      }
      await expect(pixel[3]).toBe(255);
    }
  });
};

const meta = {
  title: "Foundations/Color/Controls",
  component: ControlSpecimen,
  render: (props) => (
    <main>
      <ControlSpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    children: { table: { disable: true } },
  },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controlSampleCount: 8,
    docs: {
      description: {
        component:
          "line.control, line.strong, action.hover, and action.pressed in both themes. The translucent fills use text.primary and line.strong. Computed-style and sRGB canvas checks verify the pairings after compositing. These are color specimens; the secondary Button remains a later slice.",
      },
    },
  },
  play: verifyControls,
} satisfies Meta<typeof ControlSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true }, controlSampleCount: 16 },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const NestedThemes = {
  render: () => (
    <main class={s.comparison}>
      <ControlSpecimen theme="cotton">
        <ControlSpecimen theme="soot" />
      </ControlSpecimen>
      <ControlSpecimen theme="soot">
        <ControlSpecimen theme="cotton" />
      </ControlSpecimen>
    </main>
  ),
  parameters: { controls: { disable: true }, controlSampleCount: 32 },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedControls />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true }, controlSampleCount: 16 },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifyControls(context);
  },
} satisfies Story;
