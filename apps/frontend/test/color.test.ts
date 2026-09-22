import { describe, expect, it } from "@effect/vitest";
import Color from "colorjs.io";
import { colors } from "@amends/frontend/foundations/color";
import { compositeOnSurface } from "../src/foundations/color/contrast.ts";

it.each([
  [0, 1],
  [0.5, 0.5],
  [1, 0],
])("composites black at alpha %s over white in encoded sRGB", (alpha, expected) => {
  const blended = compositeOnSurface(`rgb(0 0 0 / ${alpha})`, "white");
  expect(blended.alpha).toBe(1);
  expect(blended.coords).toEqual([expected, expected, expected]);
});

it("rejects a translucent backdrop instead of reporting contrast against an unknown surface", () => {
  expect(() => compositeOnSurface("black", "rgb(255 255 255 / 0.5)")).toThrow("opaque surface");
});

it("rejects colors that need gamut mapping", () => {
  expect(() => compositeOnSurface("color(display-p3 1 0 0)", "white")).toThrow("in-gamut sRGB");
});

it("rejects unresolved color channels", () => {
  expect(() => compositeOnSurface("color(srgb none 0 0)", "white")).toThrow(
    "resolved color channels",
  );
});

for (const [theme, palette] of Object.entries(colors)) {
  describe(`${theme} color pairings`, () => {
    for (const [surface, background] of Object.entries(palette.surface)) {
      for (const [role, foreground] of Object.entries(palette.line)) {
        it(`keeps line.${role} identifiable on surface.${surface}`, () => {
          const border = new Color(foreground);
          expect(border.alpha).toBe(1);
          expect(border.inGamut("srgb")).toBe(true);
          expect(border.contrastWCAG21(background)).toBeGreaterThanOrEqual(3);
        });
      }
      for (const state of ["hover", "pressed"] as const) {
        it(`keeps text and the strong border readable over action.${state} on surface.${surface}`, () => {
          const layer = new Color(palette.action[state]);
          expect(layer.alpha).toBeGreaterThan(0);
          expect(layer.alpha).toBeLessThan(1);
          const backgroundColor = compositeOnSurface(palette.action[state], background);
          expect(
            new Color(palette.text.primary).contrastWCAG21(backgroundColor),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            new Color(palette.line.strong).contrastWCAG21(backgroundColor),
          ).toBeGreaterThanOrEqual(3);
        });
      }
      it(`keeps focus.ring distinguishable on surface.${surface}`, () => {
        const ring = new Color(palette.focus.ring);
        const ground = new Color(background);
        for (const color of [ring, ground]) {
          expect(color.alpha).toBe(1);
          expect(color.inGamut("srgb")).toBe(true);
        }
        // The offset places the ring against the surrounding surface, not the action fill.
        expect(ring.contrastWCAG21(ground)).toBeGreaterThanOrEqual(3);
      });
      for (const tone of ["primary", "secondary", "invalid"] as const) {
        it(`keeps text.${tone} readable on surface.${surface}`, () => {
          const text = new Color(palette.text[tone]);
          const ground = new Color(background);
          // These roles are opaque, in-gamut sRGB colors; no blending or gamut mapping is needed.
          for (const color of [text, ground]) {
            expect(color.alpha).toBe(1);
            expect(color.inGamut("srgb")).toBe(true);
          }
          // WCAG 2.2 SC 1.4.3: normal text requires 4.5:1. Never round before checking.
          expect(text.contrastWCAG21(ground)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    for (const state of ["fill", "fillHover", "fillPressed"] as const) {
      it(`keeps action.onFill readable on action.${state}`, () => {
        const text = new Color(palette.action.onFill);
        const ground = new Color(palette.action[state]);
        for (const color of [text, ground]) {
          expect(color.alpha).toBe(1);
          expect(color.inGamut("srgb")).toBe(true);
        }
        expect(text.contrastWCAG21(ground)).toBeGreaterThanOrEqual(4.5);
      });
    }
  });
}
