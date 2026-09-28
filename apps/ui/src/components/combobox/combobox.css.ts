import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const combobox = style({ position: "relative" });

// Shaped like the Select: the typed value and a chevron that opens the suggestions.
export const control = style({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "2.625rem",
  paddingInline: "0.75rem 0.5rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.field,
  cursor: "text",
  selectors: {
    "&:focus-within, &[data-open]": { borderColor: vars.color.border.strong },
    "&[data-invalid]": { borderColor: vars.color.border.danger },
    "&[data-disabled]": { backgroundColor: vars.color.surface.subtle, cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const input = style({
  ...typeScale.body,
  flex: 1,
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  selectors: {
    "&::placeholder": { color: vars.color.text.muted, opacity: 1 },
    "&:disabled": { color: vars.color.text.disabled },
  },
  "@media": { [media.mobile]: typeScale.bodyTouch },
});

export const toggle = style({
  display: "grid",
  placeItems: "center",
  flex: "none",
  width: "1.75rem",
  height: "1.75rem",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: { "&:disabled": { cursor: "default" } },
});

export const toggleIcon = style({ width: "0.875rem", height: "0.875rem" });

// Fixed to the viewport so scrolling areas cannot clip it; the component places it.
export const popup = style({
  zIndex: 50,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  padding: "0.25rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  color: vars.color.text.primary,
});

export const heading = style({
  ...typeScale.meta,
  margin: 0,
  padding: "0.5rem 0.5rem 0.375rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
});

export const listbox = style({
  flex: "0 1 auto",
  minHeight: 0,
  margin: 0,
  padding: 0,
  overflowY: "auto",
  listStyle: "none",
});

export const option = style({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  minHeight: "2.25rem",
  padding: "0.5rem",
  cursor: "pointer",
  selectors: { "&[data-active]": { backgroundColor: vars.color.surface.subtle } },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const optionText = style({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
});

export const optionLabel = style({
  ...typeScale.control,
  overflow: "hidden",
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const optionDescription = style({
  ...typeScale.hint,
  overflow: "hidden",
  color: vars.color.text.secondary,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const indicator = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const footer = style({
  ...typeScale.hint,
  margin: 0,
  padding: "0.5rem",
  color: vars.color.text.secondary,
});
