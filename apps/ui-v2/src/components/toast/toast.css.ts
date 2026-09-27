import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// Centered in the viewport, 24px above the bottom and any home indicator.
export const region = style({
  position: "fixed",
  insetInline: 0,
  bottom: "calc(1.5rem + env(safe-area-inset-bottom))",
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.5rem",
  margin: 0,
  padding: "0 1rem",
  listStyle: "none",
  pointerEvents: "none",
});

export const toast = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  boxSizing: "border-box",
  maxWidth: "min(28rem, 100%)",
  minHeight: "2.75rem",
  padding: "0.5rem 0.875rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.toast,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
  pointerEvents: "auto",
});

export const icon = style({ flex: "none", width: "1rem", height: "1rem" });

export const message = style({ minWidth: 0 });

export const action = style({
  ...typeScale.control,
  marginInlineStart: "1rem",
  marginBlock: "-0.25rem",
  padding: "0.25rem 0.375rem",
  border: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  fontWeight: fontWeight.medium,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.subtle },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});
