import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.tsx";
import { dark, light, type ColorTokens } from "../src/foundations/color/tokens.ts";
import { Theme } from "../src/foundations/theme/index.ts";
import { colorPalettes } from "../src/foundations/color/palettes.ts";
import themeMeta, { SwitchWithDraft } from "../src/foundations/theme/theme.stories.tsx";
import colorMeta, { Roles } from "../src/foundations/color/color.stories.tsx";
import typeMeta, { Scale as TypeScale } from "../src/foundations/typography/typography.stories.tsx";
import spaceMeta, { Scale as SpaceScale } from "../src/foundations/space/space.stories.tsx";
import elevationMeta, { Layers } from "../src/foundations/elevation/elevation.stories.tsx";
import iconsMeta, {
  AccessibleNames,
  Gallery,
  Sizes,
} from "../src/foundations/icons/icons.stories.tsx";

afterEach(cleanup);

function luminance(hex: string) {
  const linear = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return linear(1) * 0.2126 + linear(3) * 0.7152 + linear(5) * 0.0722;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground),
    second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const leaves = (tokens: ColorTokens) => {
  const out: Record<string, string> = {};
  const walk = (node: object, path: string) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") out[`${path}${key}`] = value;
      else walk(value, `${path}${key}.`);
    }
  };
  walk(tokens, "");
  return out;
};

describe("color roles", () => {
  it("keeps reading text and primary buttons at 4.5:1 contrast in every experimental palette", () => {
    const { neutral: _neutral, ...experiments } = colorPalettes;
    for (const [palette, modes] of Object.entries(experiments)) {
      for (const [mode, colors] of Object.entries(modes)) {
        for (const role of ["primary", "secondary", "muted"] as const) {
          for (const [surface, background] of Object.entries(colors.surface)) {
            expect(
              contrast(colors.text[role], background),
              `${palette}/${mode} ${role} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
        expect(
          contrast(colors.text.onPrimary, colors.action.primary),
          `${palette}/${mode} button`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("defines every role in both modes", () => {
    expect(Object.keys(leaves(dark))).toEqual(Object.keys(leaves(light)));
  });
  it("uses opaque hex, or hex with alpha for the scrim", () => {
    for (const [role, value] of [...Object.entries(leaves(light)), ...Object.entries(leaves(dark))])
      expect(value, role).toMatch(role.startsWith("scrim") ? /^#[\dA-F]{8}$/ : /^#[\dA-F]{6}$/);
  });
});

describe("Theme", () => {
  it("scopes a mode and lets a nested Theme choose its own", () => {
    const view = render(() => (
      <Theme mode="light" palette="linen" data-testid="outer">
        <Theme mode="dark" data-testid="inner">
          Content
        </Theme>
      </Theme>
    ));
    const outer = view.getByTestId("outer"),
      inner = view.getByTestId("inner");
    expect(outer).toHaveAttribute("data-mode", "light");
    expect(inner).toHaveAttribute("data-mode", "dark");
    expect(outer).toHaveAttribute("data-palette", "linen");
    expect(inner).toHaveAttribute("data-palette", "neutral");
    expect(outer.className).not.toBe(inner.className);
  });
});

describe("foundation stories", () => {
  const project = definePreview(preview);
  it("keeps a draft while switching palette and mode", async () => {
    await project.meta(themeMeta).story(SwitchWithDraft).run();
  });
  it("renders color roles", async () => {
    await project.meta(colorMeta).story(Roles).run();
  });
  it("renders the type scale", async () => {
    await project.meta(typeMeta).story(TypeScale).run();
  });
  it("renders spacing", async () => {
    await project.meta(spaceMeta).story(SpaceScale).run();
  });
  it("renders elevation", async () => {
    await project.meta(elevationMeta).story(Layers).run();
  });
  it("searches every icon, and renders sizes, weights, and accessible names", async () => {
    const stories = project.meta(iconsMeta);
    await stories.story(Gallery).run();
    await stories.story(Sizes).run();
    await stories.story(AccessibleNames).run();
  });
});

export function typeExamples() {
  <Theme mode="dark">Content</Theme>;
  // @ts-expect-error The caller chooses the mode.
  <Theme>Content</Theme>;
  // @ts-expect-error Only light and dark exist.
  <Theme mode="sepia">Content</Theme>;
}
