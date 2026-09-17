import { describe, expect, it } from "vitest";
import { colors } from "../src/tokens/index.ts";

type RGB = readonly [number, number, number];
type Color = { rgb: RGB; alpha: number };
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const encode = (n: number) => (n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055);
const decode = (n: number) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);

// CSS Color 4 OKLab conversion, clipped to sRGB. Alpha composites in encoded sRGB.
const parse = (css: string): Color => {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(css);
  if (!match) throw new Error(`Unsupported test colour: ${css}`);
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear: RGB = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return {
    rgb: [encode(clamp(linear[0])), encode(clamp(linear[1])), encode(clamp(linear[2]))],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
};
const composite = (foreground: Color, background: RGB): RGB => {
  const channel = (i: 0 | 1 | 2) =>
    foreground.rgb[i] * foreground.alpha + background[i] * (1 - foreground.alpha);
  return [channel(0), channel(1), channel(2)];
};
const luminance = (rgb: RGB) =>
  decode(rgb[0]) * 0.2126 + decode(rgb[1]) * 0.7152 + decode(rgb[2]) * 0.0722;
const contrast = (foreground: string, background: string, under = background) => {
  const bg = composite(parse(background), parse(under).rgb);
  const fg = composite(parse(foreground), bg);
  const low = Math.min(luminance(fg), luminance(bg));
  const high = Math.max(luminance(fg), luminance(bg));
  return (high + 0.05) / (low + 0.05);
};

it("uses the WCAG black/white contrast endpoints", () => {
  expect(contrast("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21);
  expect(contrast("oklch(0.5 0 0)", "oklch(0.5 0 0)")).toBeCloseTo(1);
  expect(contrast("oklch(0 0 0 / 0)", "oklch(1 0 0)")).toBeCloseTo(1);
});

for (const [name, color] of Object.entries(colors)) {
  describe(name, () => {
    const surfaces = {
      canvas: color.surface.canvas,
      panel: color.surface.panel,
      recessed: color.surface.recessed,
      muted: color.surface.muted,
    };
    for (const [surface, background] of Object.entries(surfaces)) {
      it(`keeps readable text and identifiable controls on ${surface}`, () => {
        for (const foreground of [
          color.text.primary,
          color.text.secondary,
          color.text.muted,
          color.brand.text,
          color.brand.textHover,
        ]) {
          expect(
            contrast(foreground, background),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        for (const foreground of [
          color.line.control,
          color.focus.ring,
          color.status.neutral,
          color.status.running,
        ]) {
          expect(
            contrast(foreground, background),
            `${foreground} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      });
      for (const status of ["pending", "success", "danger"] as const) {
        it(`keeps ${status} readable on ${surface} and its notice`, () => {
          const value = color.status[status];
          expect(contrast(value.indicator, background)).toBeGreaterThanOrEqual(3);
          expect(contrast(value.text, background)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(value.text, value.soft, background)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it("preserves text contrast on filled actions and selection", () => {
      for (const background of [
        color.action.fill,
        color.action.fillHover,
        color.action.fillPressed,
        color.status.danger.text,
        color.status.danger.indicator,
      ])
        expect(contrast(color.action.onFill, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color.brand.onFill, color.brand.fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(color.selection.text, color.selection.fill)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
