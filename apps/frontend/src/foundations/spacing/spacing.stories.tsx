import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { space, type SpaceStep } from "@amends/frontend/foundations/spacing";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./spacing.stories.css.ts";

const steps = [0, 1, 2, 3, 4, 5, 6] as const satisfies readonly SpaceStep[];
const themes = ["cotton", "soot"] as const;
const labels = { cotton: "Cotton", soot: "Soot" } as const;

function ThemeFrame(props: { theme: ColorTheme; children: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      aria-label={`${labels[props.theme]} spacing`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      {props.children}
    </article>
  );
}

function ScaleSpecimen() {
  return (
    <section class={s.group}>
      <Text as="h3" variant="body">
        Spacing scale
      </Text>
      <Text tone="secondary">Each step adds a quarter rem. Step zero has no width.</Text>
      <ul class={s.scale}>
        <For each={steps}>
          {(step) => (
            <li class={s.group}>
              <div class={s.label}>
                <Text as="span" variant="mono">
                  space[{step}]
                </Text>
                <Text as="span" variant="mono" tone="secondary">
                  {space[step]}
                </Text>
              </div>
              <div class={s.track} aria-hidden="true">
                <div class={s.measure} style={{ width: space[step] }} data-spacing-measure={step} />
              </div>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

function Examples(props: { step: SpaceStep }) {
  return (
    <section class={s.stack}>
      <Text as="h3" variant="body">
        Padding and gaps · space[{props.step}] · {space[props.step]}
      </Text>
      <div class={s.group}>
        <Text variant="mono">Padding on all four sides</Text>
        <div
          class={s.padding}
          style={{ padding: space[props.step] }}
          data-spacing-padding={props.step}
        >
          <div class={s.content}>
            <Text>Content</Text>
          </div>
        </div>
      </div>
      <For each={["horizontal", "vertical"] as const}>
        {(direction) => (
          <div class={s.group}>
            <Text variant="mono">
              {direction === "horizontal" ? "Horizontal gap" : "Vertical gap"}
            </Text>
            <div
              class={s[direction]}
              style={{ gap: space[props.step] }}
              data-spacing-gap={props.step}
              data-direction={direction}
            >
              <div class={s.block}>
                <Text as="span" variant="mono">
                  A
                </Text>
              </div>
              <div class={s.block}>
                <Text as="span" variant="mono">
                  B
                </Text>
              </div>
            </div>
          </div>
        )}
      </For>
    </section>
  );
}

function ScaleComparison() {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <ThemeFrame theme={theme}>
            <ScaleSpecimen />
          </ThemeFrame>
        )}
      </For>
    </main>
  );
}

function ExamplesComparison(props: { step: SpaceStep }) {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <ThemeFrame theme={theme}>
            <Examples step={props.step} />
          </ThemeFrame>
        )}
      </For>
    </main>
  );
}

function EnlargedSpacing() {
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
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <ThemeFrame theme={theme}>
            <ScaleSpecimen />
            <Examples step={4} />
          </ThemeFrame>
        )}
      </For>
    </main>
  );
}

// Geometry checks run in the browser; Happy DOM has no layout engine.
const verifyScale: NonNullable<StoryObj["play"]> = async ({ canvasElement, step }) => {
  await document.fonts.ready;
  await step("Measure every quarter-rem step in both themes", async () => {
    const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const measures = canvasElement.querySelectorAll<HTMLElement>("[data-spacing-measure]");
    await expect(measures).toHaveLength(steps.length * themes.length);
    for (const measure of measures) {
      const expected = (Number(measure.dataset.spacingMeasure) * root) / 4;
      await expect(measure.getBoundingClientRect().width).toBeCloseTo(expected, 2);
    }
  });
};

const verifyExamples: NonNullable<StoryObj["play"]> = async ({ canvasElement, step }) => {
  await document.fonts.ready;
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  await step("Measure all four padding edges", async () => {
    const examples = canvasElement.querySelectorAll<HTMLElement>("[data-spacing-padding]");
    await expect(examples).toHaveLength(themes.length);
    for (const example of examples) {
      const expected = (Number(example.dataset.spacingPadding) * root) / 4;
      const outer = example.getBoundingClientRect();
      const inner = example.firstElementChild!.getBoundingClientRect();
      for (const distance of [
        inner.left - outer.left,
        inner.top - outer.top,
        outer.right - inner.right,
        outer.bottom - inner.bottom,
      ]) {
        await expect(distance).toBeCloseTo(expected, 2);
      }
    }
  });
  await step("Measure horizontal and vertical gaps", async () => {
    const examples = canvasElement.querySelectorAll<HTMLElement>("[data-spacing-gap]");
    await expect(examples).toHaveLength(themes.length * 2);
    for (const example of examples) {
      const expected = (Number(example.dataset.spacingGap) * root) / 4;
      const first = example.children[0]!.getBoundingClientRect();
      const second = example.children[1]!.getBoundingClientRect();
      const distance =
        example.dataset.direction === "horizontal"
          ? second.left - first.right
          : second.top - first.bottom;
      await expect(distance).toBeCloseTo(expected, 2);
    }
  });
};

const meta = {
  title: "Foundations/Spacing",
  component: ExamplesComparison,
  args: { step: 4 },
  argTypes: { step: { control: "select", options: steps } },
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Seven quarter-rem spacing steps, demonstrated with the reviewed Text primitive. At a 16px root they measure 0, 4, 8, 12, 16, 20, and 24px. Browser play checks measure actual widths, padding edges, and horizontal/vertical gaps. Enlarged Text is available separately in the sidebar.",
      },
    },
  },
} satisfies Meta<typeof ExamplesComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Scale = {
  render: () => <ScaleComparison />,
  parameters: { controls: { disable: true } },
  play: verifyScale,
} satisfies Story;
export const PaddingAndGap = { play: verifyExamples } satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedSpacing />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifyScale(context);
    await verifyExamples(context);
  },
} satisfies Story;
