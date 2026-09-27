import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
});

export const options = style({
  display: "flex",
  gap: "0.5rem",
  "@media": { [media.mobile]: { display: "grid", gridTemplateColumns: "1fr 1fr" } },
});

// A boxed option: the chosen one is filled, outlined, and checked.
export const option = style({
  ...typeScale.control,
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  width: "9rem",
  minHeight: "2.5rem",
  paddingInline: "0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  cursor: "pointer",
  selectors: {
    "&:hover": { borderColor: vars.color.border.strong },
    "&:has(input:checked)": {
      backgroundColor: vars.color.surface.subtle,
      borderColor: vars.color.border.selected,
      color: vars.color.text.primary,
    },
    "&:has(input:focus-visible)": {
      outline: `2px solid ${vars.color.text.primary}`,
      outlineOffset: "2px",
    },
    "&:has(input:disabled)": { color: vars.color.text.disabled, cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" }, [media.mobile]: { width: "auto" } },
});

// The native radio stays in place for forms and keyboards but is not drawn.
export const input = style({
  position: "absolute",
  inset: 0,
  margin: 0,
  opacity: 0,
  cursor: "inherit",
});

export const label = style({ flex: 1 });

export const check = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  visibility: "hidden",
  selectors: { [`${option}:has(input:checked) &`]: { visibility: "visible" } },
});
