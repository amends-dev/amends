import { describe, expect, it } from "@effect/vitest";
import Color from "colorjs.io";
import { colors } from "@amends/ui/foundations/color";
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
    it("keeps every color in sRGB and both themes on the same semantic contract", () => {
      const leaves = (tree: object, path = ""): Record<string, string> =>
        Object.fromEntries(
          Object.entries(tree).flatMap(([key, value]) =>
            typeof value === "string"
              ? [[`${path}${key}`, value]]
              : Object.entries(leaves(value, `${path}${key}.`)),
          ),
        );
      const values = leaves(palette);
      expect(Object.keys(values)).toEqual(Object.keys(leaves(colors.cotton)));
      for (const [role, value] of Object.entries(values)) {
        const color = new Color(value);
        expect(color.inGamut("srgb"), role).toBe(true);
        const translucent =
          role.endsWith(".soft") ||
          [
            "action.hover",
            "action.pressed",
            "action.disabled",
            "action.danger.hover",
            "action.danger.pressed",
          ].includes(role);
        if (translucent) {
          expect(color.alpha, role).toBeGreaterThan(0);
          expect(color.alpha, role).toBeLessThan(1);
        } else expect(color.alpha, role).toBe(1);
      }
    });
    it("keeps validation and danger colors aligned", () => {
      expect(palette.text.invalid).toBe(palette.status.danger.text);
      expect(palette.line.invalid).toBe(palette.status.danger.indicator);
    });
    for (const [kind, pair] of Object.entries(palette.avatar)) {
      it(`keeps ${kind} avatar fallback text readable on its surface`, () => {
        expect(new Color(pair.text).contrastWCAG21(pair.surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const state of ["fill", "fillHover", "fillPressed"] as const) {
      it(`keeps danger action labels readable on ${state}`, () => {
        const action = palette.action.danger;
        expect(new Color(action.onFill).contrastWCAG21(action[state])).toBeGreaterThanOrEqual(4.5);
      });
    }
    it("keeps compact tooltip text readable on its dedicated surface", () => {
      expect(
        new Color(palette.text.onTooltip).contrastWCAG21(palette.surface.tooltip),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it("keeps toast content, actions and focus readable on the dark toast surface", () => {
      for (const role of ["text", "action"] as const)
        expect(
          new Color(palette.toast[role]).contrastWCAG21(palette.toast.surface),
        ).toBeGreaterThanOrEqual(4.5);
    });
    // Ordinary content uses canvas/panel. Tooltip has its own contrasting foreground.
    for (const surface of ["canvas", "panel"] as const) {
      const background = palette.surface[surface];
      for (const state of ["rest", "hover", "pressed"] as const) {
        it(`keeps danger ${state} text, borders and focus readable on surface.${surface}`, () => {
          const action = palette.action.danger;
          const effective = compositeOnSurface(
            state === "rest" ? "transparent" : action[state],
            background,
          );
          const border = new Color(state === "rest" ? action.border : action.borderStrong);
          expect(new Color(action.text).contrastWCAG21(effective)).toBeGreaterThanOrEqual(4.5);
          expect(border.contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
          expect(border.contrastWCAG21(background)).toBeGreaterThanOrEqual(3);
          expect(new Color(palette.focus.ring).contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
        });
      }
      // Decorative seams are intentionally excluded from control-boundary requirements.
      for (const role of ["control", "strong", "invalid"] as const) {
        it(`keeps line.${role} identifiable on surface.${surface}`, () => {
          const border = new Color(palette.line[role]);
          expect(border.alpha).toBe(1);
          expect(border.inGamut("srgb")).toBe(true);
          expect(border.contrastWCAG21(background)).toBeGreaterThanOrEqual(3);
        });
      }
      for (const [tone, status] of Object.entries(palette.status)) {
        it(`keeps status.${tone} text and indicators readable on surface.${surface}`, () => {
          expect(new Color(status.text).contrastWCAG21(background)).toBeGreaterThanOrEqual(4.5);
          expect(new Color(status.indicator).contrastWCAG21(background)).toBeGreaterThanOrEqual(3);
        });
        if ("soft" in status) {
          it(`keeps status.${tone} readable on its soft background over surface.${surface}`, () => {
            const effective = compositeOnSurface(status.soft, background);
            expect(new Color(status.text).contrastWCAG21(effective)).toBeGreaterThanOrEqual(4.5);
            expect(new Color(status.indicator).contrastWCAG21(effective)).toBeGreaterThanOrEqual(3);
            expect(new Color(palette.focus.ring).contrastWCAG21(effective)).toBeGreaterThanOrEqual(
              3,
            );
          });
        }
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
