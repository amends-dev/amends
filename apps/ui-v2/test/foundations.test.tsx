import { afterEach, describe, expect, it } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { definePreview } from "storybook-solidjs-vite/next";
import preview from "../.storybook/preview.tsx";
import { dark, light, type ColorTokens } from "../src/foundations/color/tokens.ts";
import { Theme } from "../src/foundations/theme/index.ts";
import colorMeta, { Roles } from "../src/foundations/color/color.stories.tsx";
import typeMeta, { Scale as TypeScale } from "../src/foundations/typography/typography.stories.tsx";
import spaceMeta, { Scale as SpaceScale } from "../src/foundations/space/space.stories.tsx";
import elevationMeta, { Layers } from "../src/foundations/elevation/elevation.stories.tsx";

afterEach(cleanup);

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
      <Theme mode="light" data-testid="outer">
        <Theme mode="dark" data-testid="inner">
          Content
        </Theme>
      </Theme>
    ));
    const outer = view.getByTestId("outer"),
      inner = view.getByTestId("inner");
    expect(outer).toHaveAttribute("data-mode", "light");
    expect(inner).toHaveAttribute("data-mode", "dark");
    expect(outer.className).not.toBe(inner.className);
  });
});

describe("foundation stories", () => {
  const project = definePreview(preview);
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
});

export function typeExamples() {
  <Theme mode="dark">Content</Theme>;
  // @ts-expect-error The caller chooses the mode.
  <Theme>Content</Theme>;
  // @ts-expect-error Only light and dark exist.
  <Theme mode="sepia">Content</Theme>;
}
