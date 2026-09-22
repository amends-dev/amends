import { style } from "@vanilla-extract/css";
import { space } from "../../foundations/spacing/tokens.ts";
import { typography } from "../../foundations/typography/tokens.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[2],
  minWidth: 0,
  overflowWrap: "anywhere",
});
export const label = style({
  ...typography.mono,
  fontSize: "0.65625rem",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: colorVars.text.secondary,
});
export const description = style({ selectors: { "&&": { fontSize: "0.6875rem" } } });
export const error = style({
  display: "flex",
  alignItems: "flex-start",
  gap: space[2],
  selectors: { "&&": { fontSize: "0.78125rem" } },
});
export const errorIndicator = style({
  flexShrink: 0,
  width: "0.375rem",
  height: "0.375rem",
  marginBlockStart: "calc((1.6em - 0.375rem) / 2)",
  borderRadius: radius.pill,
  backgroundColor: colorVars.status.danger.indicator,
  "@media": {
    "(forced-colors: active)": { backgroundColor: "CanvasText", forcedColorAdjust: "none" },
  },
});
export const errorMessage = style({ minWidth: 0 });
export const errorPrefix = style({
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
});
