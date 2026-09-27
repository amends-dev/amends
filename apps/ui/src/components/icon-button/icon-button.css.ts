import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";

export const button = style({
  display: "inline-grid",
  placeItems: "center",
  flex: "none",
  padding: 0,
  margin: 0,
  border: "none",
  borderRadius: 0,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  textDecoration: "none",
  selectors: {
    // Hover and pressed backgrounds are proposals; the mocks show resting states only.
    "&:hover": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.primary },
    "&:active": { backgroundColor: vars.color.surface.selected },
    "&:disabled": { color: vars.color.text.disabled, background: "transparent", cursor: "default" },
  },
});

// Desktop sizes from the mocks; below desktop every icon button is a 44px touch target.
export const size = styleVariants({
  regular: { width: "2rem", height: "2rem" },
  compact: { width: "1.5rem", height: "1.5rem" },
});
export const touch = style({
  "@media": { [media.touch]: { width: "2.75rem", height: "2.75rem" } },
});

export const icon = styleVariants({
  regular: { width: "1.125rem", height: "1.125rem" },
  compact: { width: "0.875rem", height: "0.875rem" },
});
export const touchIcon = style({
  "@media": { [media.touch]: { width: "1.25rem", height: "1.25rem" } },
});
