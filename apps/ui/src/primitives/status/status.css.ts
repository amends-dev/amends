import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typography } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

const indicatorColor = createVar();
export const root = style({
  ...typography.mono,
  fontSize: "0.75rem",
  display: "inline-flex",
  alignItems: "flex-start",
  verticalAlign: "middle",
  gap: space[2],
  minWidth: 0,
  maxWidth: "100%",
  color: colorVars.text.primary,
  selectors: { "&[hidden]": { display: "none" } },
});
export const tones = styleVariants(colorVars.status, (status) => ({
  vars: { [indicatorColor]: status.indicator },
}));
export const indicator = style({
  display: "inline-block",
  flexShrink: 0,
  width: "0.4375rem",
  height: "0.4375rem",
  boxSizing: "border-box",
  borderRadius: radius.pill,
  color: indicatorColor,
  marginBlockStart: "calc((1.5em - 0.4375rem) / 2)",
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { "(forced-colors: active)": { color: "CanvasText", forcedColorAdjust: "none" } },
});
export const appearances = styleVariants({
  solid: { backgroundColor: "currentColor" },
  hollow: { backgroundColor: "transparent", border: "1.2px dashed currentColor" },
});
export const label = style({
  minWidth: 0,
  overflowWrap: "anywhere",
  selectors: { "&&": { fontSize: "inherit", lineHeight: "inherit" } },
});
