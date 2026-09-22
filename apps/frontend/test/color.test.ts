import { describe, expect, it } from "@effect/vitest";
import Color from "colorjs.io";
import { colors } from "@amends/frontend/foundations/color";

for (const [theme, palette] of Object.entries(colors)) {
  describe(`${theme} color pairings`, () => {
    for (const [surface, background] of Object.entries(palette.surface)) {
      for (const [tone, foreground] of Object.entries(palette.text)) {
        it(`keeps text.${tone} readable on surface.${surface}`, () => {
          const text = new Color(foreground);
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
  });
}
