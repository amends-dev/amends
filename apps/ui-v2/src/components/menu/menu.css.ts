import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// The mocks show closed menus only; the surface follows the member picker's dropdown.
export const content = style({
  zIndex: 50,
  boxSizing: "border-box",
  minWidth: "12rem",
  maxHeight: "min(24rem, var(--kb-popper-content-available-height))",
  overflowY: "auto",
  padding: "0.25rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  outline: "none",
  color: vars.color.text.primary,
});

export const label = style({
  ...typeScale.hint,
  padding: "0.375rem 0.5rem 0.25rem",
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
});

export const item = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  minHeight: "2rem",
  paddingInline: "0.5rem",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-highlighted]": { backgroundColor: vars.color.surface.subtle },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const itemLabel = style({ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem" });

export const indicator = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const separator = style({
  height: "1px",
  margin: "0.25rem -0.25rem",
  border: "none",
  backgroundColor: vars.color.border.divider,
});

export const header = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.125rem",
  padding: "0.5rem 0.625rem 0.625rem",
  minWidth: 0,
});

export const headerTitle = style({
  ...typeScale.control,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const headerDetail = style({
  ...typeScale.hint,
  color: vars.color.text.secondary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
