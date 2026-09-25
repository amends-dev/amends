import { style, styleVariants } from "@vanilla-extract/css";
import { cotton, soot } from "../../foundations/color/tokens.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style({ border: 0, padding: 0, margin: 0, minWidth: 0 });
export const legend = style([
  typographyStyles.mono,
  { padding: 0, marginBottom: space[3], color: colorVars.text.secondary },
]);
export const options = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: space[2],
});
export const option = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: space[2],
  minWidth: 0,
  padding: space[2],
  border: `1px dashed ${colorVars.line.control}`,
  borderRadius: radius.medium,
  color: colorVars.text.primary,
  cursor: "pointer",
  overflowWrap: "anywhere",
  selectors: {
    "&:has(input:checked)": {
      backgroundColor: colorVars.action.hover,
      borderColor: colorVars.line.strong,
    },
    "&:has(input:focus-visible)": {
      outline: `2px solid ${colorVars.focus.ring}`,
      outlineOffset: "2px",
    },
    "&:has(input:enabled):hover": { backgroundColor: colorVars.action.hover },
    "&:has(input:disabled)": { color: colorVars.text.disabled, cursor: "not-allowed" },
  },
});
export const input = style({ position: "absolute", width: "1px", height: "1px", opacity: 0 });
export const preview = style({
  display: "flex",
  alignItems: "center",
  height: "1.375rem",
  borderRadius: "0.25rem",
  paddingInline: space[1],
  "@media": { "(forced-colors: active)": { border: "1px solid CanvasText" } },
});
export const previews = styleVariants({
  light: { backgroundColor: cotton.surface.canvas, color: cotton.text.primary },
  dark: { backgroundColor: soot.surface.canvas, color: soot.text.primary },
  system: {
    background: `linear-gradient(90deg, ${cotton.surface.canvas} 50%, ${soot.surface.canvas} 50%)`,
    color: cotton.line.control,
  },
});
export const seam = style({ width: "100%", borderTop: "1px dashed currentColor" });
export const label = style([
  typographyStyles.mono,
  {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    minHeight: "1.25rem",
  },
]);
export const check = style({
  width: "0.875rem",
  height: "0.875rem",
  flexShrink: 0,
  visibility: "hidden",
  selectors: { [`${option}:has(input:checked) &`]: { visibility: "visible" } },
});
export const hint = style({ marginTop: space[3], fontSize: "0.8125rem" });
