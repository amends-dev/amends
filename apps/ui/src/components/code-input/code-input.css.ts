import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight } from "../../foundations/typography/tokens.ts";

// Six 56px-tall cells, 12px apart, filling the form's width.
export const root = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: "0.75rem",
  "@media": { [media.mobile]: { gap: "0.5rem" } },
});

export const cell = style({
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  height: "3.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.primary,
  fontSize: "1.375rem",
  lineHeight: "1.875rem",
  fontWeight: fontWeight.medium,
  fontVariantNumeric: "tabular-nums",
  selectors: {
    // The cell the next digit goes into, while the field has focus.
    [`${root}:focus-within &[data-next]`]: { borderColor: vars.color.border.strong },
    // An error outlines every cell, including the focused one.
    [`${root}[data-invalid] &, ${root}[data-invalid]:focus-within &[data-next]`]: {
      borderColor: vars.color.border.danger,
    },
    [`${root}[data-disabled] &`]: {
      backgroundColor: vars.color.surface.subtle,
      color: vars.color.text.disabled,
    },
  },
});

// The real field covers the cells; its own text and caret are hidden.
export const input = style({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "transparent",
  caretColor: "transparent",
  fontSize: "1rem",
  letterSpacing: "2rem",
  selectors: {
    "&::selection": { background: "transparent" },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});
