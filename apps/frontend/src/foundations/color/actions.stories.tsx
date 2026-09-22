import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import Color from "colorjs.io";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./actions.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const states = [
  { name: "Default", fill: "fill" },
  { name: "Hover", fill: "fillHover" },
  { name: "Pressed", fill: "fillPressed" },
] as const;
type Fill = (typeof states)[number]["fill"] | "disabled";

function ActionPairings(props: { theme: ColorTheme; surface: "canvas" | "panel" }) {
  return (
    <section
      class={`${s.surface} ${s.stack}`}
      style={{ "background-color": colorVars.surface[props.surface] }}
      data-action-surface={props.surface}
    >
      <Text as="h3">On surface.{props.surface}</Text>
      <div class={s.states}>
        <For each={states}>
          {(state) => (
            <figure class={`${s.figure} ${s.stack}`}>
              <Text>{state.name}</Text>
              <div
                class={s.sample}
                style={{ "background-color": colorVars.action[state.fill] }}
                data-action-fill={state.fill}
              >
                <Text as="span" variant="mono">
                  Publish reply
                </Text>
              </div>
              <figcaption>
                <Text variant="mono">action.{state.fill}</Text>
                <Text variant="mono" tone="secondary">
                  {colors[props.theme].action[state.fill]}
                </Text>
                <Text tone="secondary">
                  {new Color(colors[props.theme].action.onFill)
                    .contrastWCAG21(colors[props.theme].action[state.fill])
                    .toFixed(2)}
                  :1 · minimum 4.5:1
                </Text>
              </figcaption>
            </figure>
          )}
        </For>
        <figure class={`${s.figure} ${s.stack}`}>
          <Text>Disabled</Text>
          <button
            type="button"
            disabled
            class={`${s.sample} ${s.disabled}`}
            data-action-fill="disabled"
          >
            <Text as="span" variant="mono">
              Publish reply
            </Text>
          </button>
          <figcaption>
            <Text variant="mono">action.disabled</Text>
            <Text variant="mono" tone="secondary">
              {colors[props.theme].action.disabled}
            </Text>
            <Text tone="secondary">
              {new Color(colors[props.theme].action.disabled).alpha * 100}% fill over this surface.
            </Text>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function ActionSpecimen(props: { theme: ColorTheme; children?: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      data-action-theme={props.theme}
      aria-label={`${labels[props.theme]} action colors`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      <Text tone="secondary">
        Neutral filled actions. Static pairings for reviewing the color foundation.
      </Text>
      <div>
        <Text variant="mono">action.onFill · {colors[props.theme].action.onFill}</Text>
        <Text variant="mono">text.disabled · {colors[props.theme].text.disabled}</Text>
      </div>
      <ActionPairings theme={props.theme} surface="canvas" />
      <ActionPairings theme={props.theme} surface="panel" />
      <Text tone="secondary">
        Disabled colors are reserved for unavailable controls. Review their readability on both
        surfaces; the enabled-text contrast requirement does not apply to inactive controls.
      </Text>
      {props.children}
    </article>
  );
}

function ComparisonSpecimen() {
  return (
    <main class={s.comparison}>
      <ActionSpecimen theme="cotton" />
      <ActionSpecimen theme="soot" />
    </main>
  );
}

function EnlargedActions() {
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

// Browser computed styles establish that the scoped CSS variables match the public tokens.
const verifyActions: NonNullable<StoryObj["play"]> = async ({
  canvasElement,
  parameters,
  step,
}) => {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  const samples = canvasElement.querySelectorAll<HTMLElement>("[data-action-fill]");
  await expect(samples).toHaveLength(parameters.actionSampleCount);
  await step("Verify scoped state colors, opacity, and enabled contrast", async () => {
    for (const sample of samples) {
      const theme = sample.closest<HTMLElement>("[data-action-theme]")!.dataset
        .actionTheme as ColorTheme;
      const fill = sample.dataset.actionFill as Fill;
      const surface = sample.closest<HTMLElement>("[data-action-surface]")!;
      const palette = colors[theme];
      const rendered = getComputedStyle(sample);
      const text = new Color(getComputedStyle(sample.firstElementChild!).color);
      const background = new Color(rendered.backgroundColor);
      const expectedText = new Color(
        fill === "disabled" ? palette.text.disabled : palette.action.onFill,
      );
      const expectedBackground = new Color(palette.action[fill]);
      await expect(text.deltaEOK(expectedText)).toBeLessThan(0.0001);
      await expect(text.alpha).toBe(1);
      await expect(background.deltaEOK(expectedBackground)).toBeLessThan(0.0001);
      await expect(background.alpha).toBeCloseTo(expectedBackground.alpha, 6);
      await expect(rendered.opacity).toBe("1");
      await expect(
        new Color(getComputedStyle(surface).backgroundColor).deltaEOK(
          palette.surface[surface.dataset.actionSurface as "canvas" | "panel"],
        ),
      ).toBeLessThan(0.0001);
      if (fill === "disabled") await expect(sample).toBeDisabled();
      else await expect(text.contrastWCAG21(background)).toBeGreaterThanOrEqual(4.5);
    }
  });
};

const meta = {
  title: "Foundations/Color/Actions",
  component: ActionSpecimen,
  render: (props) => (
    <main>
      <ActionSpecimen {...props} />
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
    actionSampleCount: 8,
    docs: {
      description: {
        component:
          "Six neutral action color roles from the existing UI. Static default, hover, pressed, and disabled pairings on both surfaces. The disabled specimen uses a native disabled button. The Button primitive has separate component and interaction stories.",
      },
    },
  },
  play: verifyActions,
} satisfies Meta<typeof ActionSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => <ComparisonSpecimen />,
  parameters: { controls: { disable: true }, actionSampleCount: 16 },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const NestedThemes = {
  render: () => (
    <main class={s.comparison}>
      <ActionSpecimen theme="cotton">
        <ActionSpecimen theme="soot" />
      </ActionSpecimen>
      <ActionSpecimen theme="soot">
        <ActionSpecimen theme="cotton" />
      </ActionSpecimen>
    </main>
  ),
  parameters: { controls: { disable: true }, actionSampleCount: 32 },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedActions />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true }, actionSampleCount: 16 },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifyActions(context);
  },
} satisfies Story;
