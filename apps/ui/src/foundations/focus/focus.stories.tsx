import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import Color from "colorjs.io";
import { colors, type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes, colorVars } from "@amends/ui/foundations/color/styles";
import { focus } from "@amends/ui/foundations/focus";
import { focusVisible } from "@amends/ui/foundations/focus/styles";
import { radius } from "@amends/ui/foundations/radius";
import { Text } from "@amends/ui/primitives/text";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./focus.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const samples = [
  { name: "Square", radius: "none", disabled: false },
  { name: "Unavailable", radius: "pill", disabled: true },
  { name: "Pill", radius: "pill", disabled: false },
] as const;

function FocusSpecimen(props: { theme: ColorTheme; children?: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-focus-theme={props.theme}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <Text tone="secondary">
        Press Tab to move through the samples, or Shift+Tab to move back. Unavailable controls are
        skipped.
      </Text>
      <div>
        <Text variant="mono">
          <span class={s.swatch} data-focus-swatch aria-hidden="true" />
          focus.ring · {colors[props.theme].focus.ring}
        </Text>
        <Text variant="mono">
          Width {focus.width} · offset {focus.offset}
        </Text>
      </div>
      <For each={["canvas", "panel"] as const}>
        {(surface) => (
          <section
            class={`${s.surface} ${s.stack}`}
            style={{ "background-color": colorVars.surface[surface] }}
            data-focus-surface={surface}
          >
            <Text as="h3">On surface.{surface}</Text>
            <div class={s.samples}>
              <For each={samples}>
                {(sample) => (
                  <button
                    type="button"
                    class={`${s.sample} ${focusVisible} ${sample.disabled ? s.disabled : ""}`}
                    style={{ "border-radius": radius[sample.radius] }}
                    disabled={sample.disabled}
                    data-focus-sample={sample.radius}
                  >
                    <Text as="span" variant="mono">
                      {sample.name}
                    </Text>
                  </button>
                )}
              </For>
            </div>
            <Text tone="secondary">
              {new Color(colors[props.theme].focus.ring)
                .contrastWCAG21(colors[props.theme].surface[surface])
                .toFixed(2)}
              :1 ring contrast · minimum 3:1
            </Text>
          </section>
        )}
      </For>
      <Text tone="secondary">
        Native buttons demonstrate focus only. Their size and appearance are workshop specimens.
      </Text>
      {props.children}
    </article>
  );
}

function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <FocusSpecimen theme="cotton" />
      <FocusSpecimen theme="soot" />
    </main>
  );
}

function EnlargedFocus() {
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

// Do not move focus here: synthetic key events cannot establish the browser's input modality.
// Review the actual :focus-visible selector with real Tab/Shift+Tab presses in the browser.
const verifySpecimens: NonNullable<StoryObj["play"]> = async ({
  canvasElement,
  parameters,
  step,
}) => {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  const forcedColors = doc.defaultView!.matchMedia("(forced-colors: active)").matches;
  const controls = canvasElement.querySelectorAll<HTMLButtonElement>("[data-focus-sample]");
  await expect(controls).toHaveLength(parameters.focusSampleCount);
  await step("Verify ring colors, surface contrast, and room around the controls", async () => {
    const room = Number.parseFloat(focus.width) + Number.parseFloat(focus.offset);
    for (const control of controls) {
      const scope = control.closest<HTMLElement>("[data-focus-theme]")!;
      const theme = scope.dataset.focusTheme as ColorTheme;
      const swatch = scope.querySelector<HTMLElement>("[data-focus-swatch]")!;
      const ring = new Color(getComputedStyle(swatch).backgroundColor);
      const surface = control.closest<HTMLElement>("[data-focus-surface]")!;
      const surfaceColor = new Color(getComputedStyle(surface).backgroundColor);
      // Forced colors replace author swatches; review the actual system outline with keyboard input.
      if (!forcedColors) {
        await expect(ring.deltaEOK(colors[theme].focus.ring)).toBeLessThan(0.0001);
        await expect(ring.alpha).toBe(1);
        await expect(ring.contrastWCAG21(surfaceColor)).toBeGreaterThanOrEqual(3);
      }
      const outer = surface.getBoundingClientRect();
      const box = control.getBoundingClientRect();
      for (const space of [
        box.left - outer.left,
        outer.right - box.right,
        box.top - outer.top,
        outer.bottom - box.bottom,
      ]) {
        await expect(space).toBeGreaterThanOrEqual(room);
      }
      const group = getComputedStyle(control.parentElement!);
      await expect(Number.parseFloat(group.columnGap)).toBeGreaterThanOrEqual(room * 2);
      await expect(Number.parseFloat(group.rowGap)).toBeGreaterThanOrEqual(room * 2);
    }
  });
};

const meta = {
  title: "Foundations/Focus",
  component: FocusSpecimen,
  render: (props) => (
    <main>
      <FocusSpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    children: { table: { disable: true } },
  },
  tags: ["autodocs"],
  play: verifySpecimens,
  parameters: {
    layout: "fullscreen",
    focusSampleCount: 6,
    docs: {
      description: {
        component:
          "A 2px solid ring with a 2px offset, applied by the production focusVisible class. Use real Tab and Shift+Tab to review the browser's focus indicator. Play checks verify colors, contrast, and space for the ring without taking focus.",
      },
    },
  },
} satisfies Meta<typeof FocusSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true }, focusSampleCount: 12 },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const NestedThemes = {
  render: () => (
    <main class={s.comparison}>
      <FocusSpecimen theme="cotton">
        <FocusSpecimen theme="soot" />
      </FocusSpecimen>
      <FocusSpecimen theme="soot">
        <FocusSpecimen theme="cotton" />
      </FocusSpecimen>
    </main>
  ),
  parameters: { controls: { disable: true }, focusSampleCount: 24 },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedFocus />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true }, focusSampleCount: 12 },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifySpecimens(context);
  },
} satisfies Story;
