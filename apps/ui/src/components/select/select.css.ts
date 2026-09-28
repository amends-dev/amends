import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { typeScale } from "../../foundations/typography/tokens.ts";

// Shaped like the Input: 42px, bordered, reading-size text; 44px on touch, 16px text on phones.
export const trigger = style({
  ...typeScale.body,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "2.625rem",
  margin: 0,
  paddingInline: "0.75rem",
  border: `1px solid ${vars.color.border.default}`,
  borderRadius: 0,
  backgroundColor: vars.color.surface.field,
  color: vars.color.text.primary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-expanded]": { borderColor: vars.color.border.strong },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&[aria-invalid=true]": { borderColor: vars.color.border.danger },
    "&[data-disabled]": {
      backgroundColor: vars.color.surface.subtle,
      color: vars.color.text.disabled,
      cursor: "default",
    },
  },
  "@media": {
    [media.touch]: { minHeight: "2.75rem" },
    [media.mobile]: typeScale.bodyTouch,
  },
});

export const value = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: { "&[data-placeholder-shown]": { color: vars.color.text.muted } },
});

export const icon = style({ display: "grid", flex: "none", color: vars.color.text.secondary });

export const chevron = style({ width: "0.875rem", height: "0.875rem" });

// The list follows the menus' surface, as wide as the field.
export const content = style({
  zIndex: 50,
  boxSizing: "border-box",
  maxHeight: "min(20rem, var(--kb-popper-content-available-height))",
  overflowY: "auto",
  padding: "0.25rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  outline: "none",
  color: vars.color.text.primary,
});

export const listbox = style({ margin: 0, padding: 0, listStyle: "none", outline: "none" });

export const item = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  minHeight: "2.25rem",
  paddingInline: "0.5rem",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-highlighted]": { backgroundColor: vars.color.surface.subtle },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const itemLabel = style({ flex: 1, minWidth: 0 });

// An option with a second line: the label over its description.
export const itemText = style({
  display: "flex",
  flex: 1,
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
  paddingBlock: "0.5rem",
});

export const itemDescription = style({ ...typeScale.hint, color: vars.color.text.secondary });

// The action after the options, set off by a divider.
export const action = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  boxSizing: "border-box",
  width: "100%",
  minHeight: "2.5rem",
  marginBlockStart: "0.25rem",
  paddingInline: "1rem",
  border: "none",
  borderBlockStart: `1px solid ${vars.color.border.divider}`,
  background: "none",
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const indicator = style({ flex: "none", width: "0.875rem", height: "0.875rem" });
