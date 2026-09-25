import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";

export const root = style({
  display: "block",
  width: "9.375rem",
  maxWidth: "100%",
  height: "auto",
  flexShrink: 0,
});
// The Illustration reference draws in ink and cloth, so a theme change is a token swap.
// Forced colors leave SVG strokes alone, so each role maps to the system text color there.
const stroke = (color: string) =>
  style({ stroke: color, "@media": { "(forced-colors: active)": { stroke: "CanvasText" } } });
export const ink = stroke(colorVars.text.primary);
export const thread = stroke(colorVars.text.secondary);
export const cloth = stroke(colorVars.line.control);
