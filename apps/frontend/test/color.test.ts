import { describe, expect, it } from "@effect/vitest";
import Color from "colorjs.io";
import { colors } from "@amends/frontend/foundations/color";

for (const [theme, palette] of Object.entries(colors)) {
  describe(`${theme} color pairings`, () => {
    for (const [surface, background] of Object.entries(palette.surface)) {
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
      for (const tone of ["primary", "secondary"] as const) {
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
