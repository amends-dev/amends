import { For, onCleanup, onMount, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { radius, type RadiusName } from "@amends/frontend/foundations/radius";
import type { ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { Text } from "@amends/frontend/primitives/text";
import "@amends/frontend/foundations/typography/fonts";
import * as s from "./radius.stories.css.ts";

const names = ["none", "pill"] as const satisfies readonly RadiusName[];
const themes = ["cotton", "soot"] as const;
const labels = { cotton: "Cotton", soot: "Soot" } as const;
// Rem dimensions belong to these specimens, not the production radius export.
const sides = { compact: 2, regular: 3, large: 4 } as const;
type SpecimenSize = keyof typeof sides;
const sizes = ["compact", "regular", "large"] as const satisfies readonly SpecimenSize[];

function ThemeFrame(props: { theme: ColorTheme; children: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.frame} ${s.stack}`}
      aria-label={`${labels[props.theme]} radius`}
    >
      <Text as="h2" variant="heading">
        {labels[props.theme]}
      </Text>
      {props.children}
    </article>
  );
}

function RadiusSpecimens(props: { size: SpecimenSize }) {
  return (
    <div class={s.stack}>
      <For each={names}>
        {(name) => (
          <section class={s.group}>
            <Text variant="mono">
              radius.{name} · {radius[name]}
            </Text>
            <div class={s.shapes}>
              <For each={["square", "rectangle"] as const}>
                {(shape) => (
                  <figure
                    class={s.figure}
                    style={{ width: `${sides[props.size] * (shape === "square" ? 1 : 3)}rem` }}
                  >
                    <div
                      class={s.shape}
                      style={{ height: `${sides[props.size]}rem`, "border-radius": radius[name] }}
                      data-radius-name={name}
                      data-radius-shape={shape}
                      data-radius-size={props.size}
                      aria-hidden="true"
                    />
                    <figcaption class={s.caption}>
                      <Text as="span" variant="mono" tone="secondary">
                        {shape === "square" ? "Square" : "Rectangle"}
                      </Text>
                    </figcaption>
                  </figure>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}

function RadiusComparison(props: { size: SpecimenSize }) {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <ThemeFrame theme={theme}>
            <Text tone="secondary">Specimen size: {props.size}</Text>
            <RadiusSpecimens size={props.size} />
          </ThemeFrame>
        )}
      </For>
    </main>
  );
}

function AllSizes() {
  return (
    <main class={s.comparison}>
      <For each={themes}>
        {(theme) => (
          <ThemeFrame theme={theme}>
            <For each={sizes}>
              {(size) => (
                <section class={s.group}>
                  <Text as="h3">{size}</Text>
                  <RadiusSpecimens size={size} />
                </section>
              )}
            </For>
          </ThemeFrame>
        )}
      </For>
    </main>
  );
}

function EnlargedRadii() {
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
  return <RadiusComparison size="regular" />;
}

// Corner hit tests exercise the curved border edge, not just the declared CSS value.
const verifyRadii: NonNullable<StoryObj["play"]> = async ({ canvasElement, parameters, step }) => {
  const doc = canvasElement.ownerDocument;
  await doc.fonts.ready;
  const view = doc.defaultView!;
  const previous = { x: view.scrollX, y: view.scrollY };
  const specimens = canvasElement.querySelectorAll<HTMLElement>("[data-radius-name]");
  await expect(specimens).toHaveLength(parameters.radiusSpecimenCount);
  try {
    await step("Check dimensions and all four corner values", async () => {
      const root = Number.parseFloat(getComputedStyle(doc.documentElement).fontSize);
      for (const specimen of specimens) {
        const name = specimen.dataset.radiusName as RadiusName;
        const size = specimen.dataset.radiusSize as SpecimenSize;
        const rendered = getComputedStyle(specimen);
        const box = specimen.getBoundingClientRect();
        const available = specimen.parentElement!.parentElement!.getBoundingClientRect().width;
        const nominal = sides[size] * root * (specimen.dataset.radiusShape === "square" ? 1 : 3);
        await expect(box.width).toBeCloseTo(Math.min(nominal, available), 2);
        await expect(box.height).toBeCloseTo(sides[size] * root, 2);
        for (const corner of [
          rendered.borderTopLeftRadius,
          rendered.borderTopRightRadius,
          rendered.borderBottomLeftRadius,
          rendered.borderBottomRightRadius,
        ]) {
          await expect(corner).toBe(radius[name]);
        }
      }
    });
    await step("Verify square and rounded corner boundaries", async () => {
      for (const specimen of specimens) {
        specimen.scrollIntoView({ block: "center", inline: "center" });
        const center = specimen.getBoundingClientRect();
        await expect(
          doc.elementFromPoint(center.left + center.width / 2, center.top + center.height / 2),
        ).toBe(specimen);
        for (const bottom of [false, true]) {
          specimen.scrollIntoView({ block: bottom ? "end" : "start", inline: "center" });
          const box = specimen.getBoundingClientRect();
          for (const right of [false, true]) {
            const hit = doc.elementFromPoint(
              right ? box.right - 2 : box.left + 2,
              bottom ? box.bottom - 2 : box.top + 2,
            );
            if (specimen.dataset.radiusName === "none") await expect(hit).toBe(specimen);
            else await expect(hit).not.toBe(specimen);
          }
        }
      }
    });
  } finally {
    view.scrollTo(previous.x, previous.y);
  }
};

const meta = {
  title: "Foundations/Radius",
  component: RadiusComparison,
  args: { size: "regular" },
  argTypes: {
    size: {
      control: "select",
      options: sizes,
      description: "Specimen dimensions, not control-size tokens.",
    },
  },
  play: verifyRadii,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    radiusSpecimenCount: 8,
    docs: {
      description: {
        component:
          "Only radius.none (0px) and radius.pill (9999px). Squares and rectangles use the exported values, with Text labels and spacing tokens. Browser checks verify dimensions, four corner values, and corner hit boundaries. Enlarged Text is available separately in the sidebar.",
      },
    },
  },
} satisfies Meta<typeof RadiusComparison>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {} satisfies Story;
export const Sizes = {
  render: () => <AllSizes />,
  parameters: { controls: { disable: true }, radiusSpecimenCount: 24 },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedRadii />,
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifyRadii(context);
  },
} satisfies Story;
