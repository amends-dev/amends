import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
export const root = style({
  display: "inline-flex",
  alignSelf: "flex-start",
  flexWrap: "wrap",
  gap: "0.125rem",
  padding: "0.1875rem",
  border: `1.3px dashed ${colorVars.line.control}`,
  borderRadius: radius.pill,
  boxSizing: "border-box",
  maxWidth: "100%",
  minWidth: 0,
});
export const item = style({
  position: "relative",
  display: "inline-flex",
  minWidth: 0,
  maxWidth: "100%",
  borderRadius: radius.pill,
});
export const input = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "pointer",
  selectors: { "&:disabled": { cursor: "not-allowed" } },
});
export const label = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  minHeight: "2rem",
  padding: "0.375rem 0.875rem",
  borderRadius: radius.pill,
  fontFamily: fontFamilies.mono,
  fontSize: "0.75rem",
  fontWeight: 400,
  lineHeight: 1.5,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
  pointerEvents: "none",
  selectors: {
    [`${input}:checked + &`]: {
      background: colorVars.action.selected,
      color: colorVars.text.primary,
    },
    [`${input}:hover:enabled:not(:checked) + &`]: { background: colorVars.action.hover },
    [`${input}:focus-visible + &`]: {
      outline: `2px solid ${colorVars.focus.ring}`,
      outlineOffset: 1,
    },
    [`${input}:disabled + &`]: { color: colorVars.text.disabled },
  },
  "@media": {
    "(any-pointer: coarse)": { minHeight: "2.75rem", minWidth: "2.75rem" },
    "(forced-colors: active)": {
      selectors: {
        [`${input}:checked + &`]: {
          background: "Highlight",
          color: "HighlightText",
          forcedColorAdjust: "none",
        },
        [`${input}:disabled + &`]: { color: "GrayText" },
      },
    },
  },
});
