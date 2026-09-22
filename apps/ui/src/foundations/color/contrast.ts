import Color from "colorjs.io";

/** Workshop/test support only. Composite an in-gamut layer over an opaque surface in encoded sRGB. */
export function compositeOnSurface(layer: string, surface: string): Color {
  const source = new Color(layer).to("srgb");
  const backdrop = new Color(surface).to("srgb");
  if (backdrop.alpha !== 1) throw new Error("Contrast review requires an opaque surface");
  if (!source.inGamut("srgb") || !backdrop.inGamut("srgb")) {
    throw new Error("Contrast review requires in-gamut sRGB colors");
  }
  const channel = (index: 0 | 1 | 2) => {
    const foreground = source.coords[index];
    const background = backdrop.coords[index];
    if (
      foreground === null ||
      background === null ||
      !Number.isFinite(foreground) ||
      !Number.isFinite(background)
    ) {
      throw new Error("Contrast review requires resolved color channels");
    }
    return foreground * source.alpha + background * (1 - source.alpha);
  };
  return new Color("srgb", [channel(0), channel(1), channel(2)]);
}
