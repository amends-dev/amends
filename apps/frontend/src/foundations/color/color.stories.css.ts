import { style } from "@vanilla-extract/css";
import { colorVars } from "./theme.css.ts";

// Workshop layout only. Typography, spacing, and radius foundations are separate slices.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
});
export const specimen = style({
  minWidth: 0,
  padding: 24,
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  lineHeight: 1.5,
});
export const title = style({ margin: "0 0 8px", fontSize: 28, fontWeight: 500 });
export const description = style({ margin: "0 0 24px", color: colorVars.text.secondary });
export const tokens = style({ display: "grid", gap: 16, margin: "0 0 32px" });
export const token = style({
  position: "relative",
  minHeight: 48,
  paddingLeft: 64,
});
export const swatch = style({ position: "absolute", top: 0, left: 0, width: 48, height: 48 });
export const tokenValue = style({
  margin: 0,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const canvasSample = style({ backgroundColor: colorVars.surface.canvas, padding: "20px 0" });
export const panelSample = style({ backgroundColor: colorVars.surface.panel, padding: 20 });
export const sampleTitle = style({ margin: "0 0 16px", fontSize: 14, fontWeight: 500 });
export const primary = style({ color: colorVars.text.primary });
export const secondary = style({ color: colorVars.text.secondary });
export const sampleText = style({ margin: "12px 0 4px" });
export const ratio = style({ margin: 0, fontSize: 12, color: colorVars.text.secondary });
