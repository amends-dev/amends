import { style } from "@vanilla-extract/css";
import { fieldControl } from "../control/field-control.css.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

export const root = style({ position: "relative", minWidth: 0 });
export const trigger = style([
  fieldControl,
  {
    display: "flex",
    alignItems: "center",
    gap: space[3],
    textAlign: "start",
    cursor: "pointer",
    selectors: { "&[data-expanded]:enabled": { borderColor: colorVars.line.strong } },
  },
]);
export const value = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
  selectors: {
    "&[data-placeholder-shown]:not([data-disabled])": { color: colorVars.text.secondary },
  },
});
export const icon = style({ display: "inline-flex", flexShrink: 0, color: "inherit" });
export const content = style({
  zIndex: 20,
  boxSizing: "border-box",
  minWidth: 0,
  width: "var(--kb-popper-anchor-width)",
  maxWidth: "calc(100vw - 16px)",
  padding: "0.375rem",
  borderRadius: radius.medium,
  backgroundColor: colorVars.surface.panel,
  color: colorVars.text.primary,
  fontFamily: fontFamilies.sans,
  fontSize: "1rem",
  fontWeight: 400,
  lineHeight: 1.5,
  boxShadow: "0 2px 4px oklch(0.24 0.014 84 / 0.06), 0 10px 28px oklch(0.24 0.014 84 / 0.1)",
  "@media": { "(forced-colors: active)": { border: "1px solid CanvasText", boxShadow: "none" } },
});
export const listbox = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  outline: "none",
  overflowY: "auto",
  overscrollBehavior: "contain",
  maxHeight: "min(18rem, calc(var(--kb-popper-content-available-height, 100vh) - 0.75rem))",
});
export const item = style({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  minHeight: "2.75rem",
  boxSizing: "border-box",
  padding: `${space[2]} ${space[3]}`,
  borderRadius: "0.4375rem",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-selected]": { backgroundColor: colorVars.action.hover },
    "&[data-highlighted]": { backgroundColor: colorVars.action.hover },
    "&[data-disabled]": { color: colorVars.text.disabled, cursor: "not-allowed" },
    "&:focus-visible": { outline: `2px solid ${colorVars.focus.ring}`, outlineOffset: "-2px" },
  },
  "@media": {
    "(forced-colors: active)": {
      selectors: {
        "&[data-highlighted]": {
          forcedColorAdjust: "none",
          backgroundColor: "Highlight",
          color: "HighlightText",
        },
        "&[data-disabled]": { color: "GrayText" },
        "&:focus-visible": { outlineColor: "Highlight" },
      },
    },
  },
});
export const indicatorSlot = style({
  width: "0.875rem",
  flexShrink: 0,
  fontFamily: fontFamilies.mono,
  fontSize: "0.75rem",
});
export const optionLabel = style({ flex: 1, minWidth: 0, overflowWrap: "anywhere" });
export const native = style({
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clipPath: "inset(50%)",
  border: 0,
  whiteSpace: "nowrap",
});
