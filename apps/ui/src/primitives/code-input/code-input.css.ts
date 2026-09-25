import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { focus } from "../../foundations/focus/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";

export const root = style({
  position: "relative",
  display: "block",
  width: "100%",
  maxWidth: "26.25rem",
  minWidth: 0,
  direction: "ltr",
  fontFamily: fontFamilies.mono,
  fontSize: "1.3125rem",
  containerType: "inline-size",
  borderRadius: radius.medium,
  selectors: {
    "&:has(input:focus-visible)": {
      outline: `${focus.width} solid ${colorVars.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
  "@media": {
    "(forced-colors: active)": {
      selectors: { "&:has(input:focus-visible)": { outlineColor: "Highlight" } },
    },
  },
});
const gap = `min(${space[2]}, 2cqi)`;
export const cells = style({
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap,
  height: "3.5rem",
  "@container": { "(max-width: 12rem)": { gap: 0 } },
});
export const cell = style({
  boxSizing: "border-box",
  border: `1.4px dashed ${colorVars.line.control}`,
  borderRadius: radius.medium,
  "@container": {
    "(max-width: 12rem)": {
      display: "none",
      selectors: { "&:first-child": { display: "block", gridColumn: "1 / -1" } },
    },
  },
  selectors: {
    [`${root}:has(input:focus:enabled) &`]: { borderColor: colorVars.line.strong },
    [`${root}:has(input[aria-invalid]:not([aria-invalid="false"]):enabled) &`]: {
      borderColor: colorVars.line.invalid,
    },
    [`${root}:has(input:disabled) &`]: { backgroundColor: colorVars.action.disabled },
  },
  "@media": {
    "(forced-colors: active)": {
      backgroundColor: "Canvas",
      borderColor: "ButtonText",
      selectors: {
        [`${root}:has(input:focus:enabled) &`]: { borderColor: "Highlight" },
        [`${root}:has(input[aria-invalid]:not([aria-invalid="false"]):enabled) &`]: {
          borderColor: "CanvasText",
        },
        [`${root}:has(input:disabled) &`]: { borderColor: "GrayText", backgroundColor: "Canvas" },
      },
    },
  },
});
export const viewport = style({ position: "absolute", inset: 0, overflow: "clip" });
// The native glyph advance equals the cell pitch. An extra pitch accommodates the
// final letter-space so a full value never scrolls away from its decorative cells.
const pitch = `((100cqi + ${gap}) / 6)`;
export const input = style({
  boxSizing: "border-box",
  display: "block",
  width: `calc(100% + ${pitch})`,
  height: "100%",
  margin: 0,
  padding: 0,
  paddingLeft: `max(0px, calc((${pitch} - ${gap} - 1ch) / 2))`,
  border: 0,
  borderRadius: 0,
  outline: "none",
  backgroundColor: "transparent",
  color: colorVars.text.primary,
  caretColor: colorVars.text.primary,
  fontFamily: fontFamilies.mono,
  fontSize: "1.3125rem",
  fontWeight: 400,
  lineHeight: 1,
  letterSpacing: `calc(${pitch} - 1ch)`,
  textAlign: "left",
  direction: "ltr",
  "@container": {
    "(max-width: 12rem)": {
      width: "100%",
      padding: `0 min(${space[3]}, 2cqi)`,
      letterSpacing: "normal",
    },
  },
  selectors: {
    "&::placeholder": { color: colorVars.text.secondary, opacity: 1 },
    "&:disabled": { color: colorVars.text.disabled, cursor: "not-allowed", opacity: 1 },
  },
  "@media": {
    "(forced-colors: active)": {
      color: "CanvasText",
      caretColor: "CanvasText",
      selectors: { "&:disabled": { color: "GrayText" } },
    },
  },
});
// The native caret after the sixth character sits in the clipped trailing space.
// Display that insertion point next to the last glyph without changing selection.
export const endCaret = style({
  display: "none",
  position: "absolute",
  pointerEvents: "none",
  right: `max(0px, calc((${pitch} - ${gap} - 1ch) / 2))`,
  top: "50%",
  transform: "translateY(-50%)",
  width: "1px",
  height: "1.3125rem",
  backgroundColor: colorVars.text.primary,
  selectors: {
    [`${root}[data-at-end]:has(input:focus:enabled:not([readonly])) &`]: { display: "block" },
  },
  "@container": {
    "(max-width: 12rem)": {
      selectors: {
        [`${root}[data-at-end]:has(input:focus:enabled:not([readonly])) &`]: { display: "none" },
      },
    },
  },
  "@media": { "(forced-colors: active)": { backgroundColor: "CanvasText" } },
});
