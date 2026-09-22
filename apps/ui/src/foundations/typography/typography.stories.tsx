import { For, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";
import { type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { typography, type TypographyRole } from "@amends/ui/foundations/typography";
import { typographyStyles } from "@amends/ui/foundations/typography/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./typography.stories.css.ts";

const roles = ["body", "heading", "mono"] as const;
const labels = { cotton: "Cotton", soot: "Soot" } as const;
const samples = {
  body: "Bring the discussion into one place. Keep the context close, give each idea room, and make the next step easy to find.",
  heading: "A place for every conversation",
  mono: "thread_01a0c423-ad05-74e2-a0c9-b99106489fef · 09:41:03 · queued",
} satisfies Record<TypographyRole, string>;

function TypographySpecimen(props: { theme: ColorTheme }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.specimen}`}
      aria-label={`${labels[props.theme]} typography`}
    >
      <h2 class={`${typographyStyles.heading} ${s.title}`}>{labels[props.theme]}</h2>
      <p class={`${typographyStyles.body} ${s.description}`}>
        Three styles, each shown in primary and secondary text.
      </p>
      <For each={roles}>
        {(role) => (
          <section class={s.role}>
            <h3 class={`${typographyStyles.mono} ${s.roleName}`}>{role}</h3>
            <p class={`${typographyStyles.mono} ${s.details}`}>
              {typography[role].fontFamily.split(",")[0]} · {typography[role].fontSize} · weight{" "}
              {typography[role].fontWeight}
              <br />
              Line height {typography[role].lineHeight} · tracking {typography[role].letterSpacing}
            </p>
            <For each={["primary", "secondary"] as const}>
              {(tone) => (
                <p
                  class={`${typographyStyles[role]} ${s.sample} ${tone === "secondary" ? s.secondary : ""}`}
                  data-typography-role={role}
                  data-tone={tone}
                >
                  {samples[role]}
                </p>
              )}
            </For>
          </section>
        )}
      </For>
    </article>
  );
}

function ComparisonSpecimens() {
  return (
    <main class={s.comparison}>
      <TypographySpecimen theme="cotton" />
      <TypographySpecimen theme="soot" />
    </main>
  );
}

function EnlargedSpecimens() {
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
  return <ComparisonSpecimens />;
}

// These checks require a browser's font loader and layout engine, not Happy DOM.
const verifyTypography: NonNullable<StoryObj["play"]> = async ({ canvasElement, step }) => {
  await step("Load all three normal-weight font faces", async () => {
    for (const role of roles) {
      const definition = typography[role];
      const font = `${definition.fontWeight} 16px ${definition.fontFamily}`;
      const faces = await document.fonts.load(font, samples[role]);
      await expect(faces.length).toBeGreaterThan(0);
      await expect(faces.every((face) => face.status === "loaded")).toBe(true);
      await expect(document.fonts.check(font, samples[role])).toBe(true);
    }
  });
  await step("Verify rendered metrics and wrapping", async () => {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    for (const role of roles) {
      const definition = typography[role];
      const elements = canvasElement.querySelectorAll<HTMLElement>(
        `[data-typography-role="${role}"]`,
      );
      await expect(elements.length).toBeGreaterThan(0);
      for (const element of elements) {
        const rendered = getComputedStyle(element);
        const size = Number.parseFloat(definition.fontSize) * rootSize;
        await expect(rendered.fontFamily).toBe(definition.fontFamily);
        await expect(rendered.fontWeight).toBe(String(definition.fontWeight));
        await expect(rendered.fontStyle).toBe(definition.fontStyle);
        await expect(Number.parseFloat(rendered.fontSize)).toBeCloseTo(size, 2);
        await expect(Number.parseFloat(rendered.lineHeight)).toBeCloseTo(
          size * definition.lineHeight,
          2,
        );
        const tracking =
          rendered.letterSpacing === "normal" ? 0 : Number.parseFloat(rendered.letterSpacing);
        await expect(tracking).toBeCloseTo(size * Number.parseFloat(definition.letterSpacing), 2);
        await expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
        // Glyph ink can extend beyond the line box. Visible overhang is not clipping.
        if (element.scrollHeight > element.clientHeight) {
          await expect(rendered.overflowY).toBe("visible");
        }
      }
    }
  });
};

const meta = {
  title: "Foundations/Typography",
  component: TypographySpecimen,
  render: (props) => (
    <main>
      <TypographySpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  play: verifyTypography,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Body, heading, and mono styles with their actual font files. Sizes use rem, line heights are unitless, and typography does not select HTML semantics or text color. Browser play checks verify font loading, computed metrics, and wrapping. Enlarged Text is available separately in the sidebar.",
      },
    },
  },
} satisfies Meta<typeof TypographySpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => <ComparisonSpecimens />,
  parameters: { controls: { disable: true } },
} satisfies Story;
export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const Narrow = {
  render: () => (
    <main class={s.narrow}>
      <TypographySpecimen theme="cotton" />
      <TypographySpecimen theme="soot" />
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
export const EnlargedText = {
  render: () => <EnlargedSpecimens />,
  // This scenario changes the preview document's root size; keep it out of shared Docs canvases.
  tags: ["!autodocs"],
  parameters: { controls: { disable: true } },
  play: async (context) => {
    await expect(document.documentElement.style.fontSize).toBe("200%");
    await verifyTypography(context);
  },
} satisfies Story;
