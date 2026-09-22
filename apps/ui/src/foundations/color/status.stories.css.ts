import { style } from "@vanilla-extract/css";
import { colorVars } from "./theme.css.ts";
import { space } from "../spacing/tokens.ts";
import { radius } from "../radius/tokens.ts";

export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 34rem), 1fr))",
});
export const frame = style({ padding: space[5], minWidth: 0, overflowWrap: "anywhere" });
export const surface = style({ padding: space[4], minWidth: 0 });
export const stack = style({ display: "grid", gap: space[4], minWidth: 0 });
export const cases = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
  gap: space[5],
});
export const figure = style({ margin: 0, minWidth: 0, alignContent: "start" });
export const sample = style({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  padding: space[3],
  minWidth: 0,
  borderRadius: radius.medium,
});
export const indicator = style({
  width: "1.25rem",
  height: "1.25rem",
  flexShrink: 0,
  // SVG's explicit color can survive forced colors; map these examples to the user's foreground.
  "@media": { "(forced-colors: active)": { color: "CanvasText !important" } },
});
export const caption = style({ display: "grid", gap: space[1], minWidth: 0 });
export const seam = style({ border: 0, borderTop: `1px dashed ${colorVars.line.seam}`, margin: 0 });
