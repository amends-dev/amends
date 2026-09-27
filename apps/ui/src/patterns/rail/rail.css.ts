import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media, shell } from "../../foundations/layout/tokens.ts";

export const rail = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  flex: "none",
  boxSizing: "border-box",
  width: shell.rail,
  minHeight: 0,
  paddingBlock: "0.625rem 0.8125rem",
});

// Destinations are 40px on desktop and 44px touch targets below it.
const target = {
  width: "2.5rem",
  height: "2.5rem",
  "@media": { [media.touch]: { width: "2.75rem", height: "2.75rem" } },
} as const;

export const brand = style({
  ...target,
  display: "grid",
  placeItems: "center",
  flex: "none",
  color: vars.color.text.primary,
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});

export const seam = style({
  flex: "none",
  width: "1.5rem",
  height: "1px",
  marginBlock: "0.5625rem 0.75rem",
  backgroundColor: vars.color.border.divider,
  "@media": { [media.touch]: { marginBlockStart: "0.3125rem" } },
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
  "@media": { [media.touch]: { gap: "0.625rem" } },
});

export const item = style({
  ...target,
  position: "relative",
  display: "grid",
  placeItems: "center",
  boxSizing: "border-box",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&[aria-current]": {
      backgroundColor: vars.color.surface.railSelected,
      color: vars.color.text.primary,
    },
    // The 2px bar that marks the current item across the rail, sidebar, and lists.
    "&[aria-current]::before": {
      content: '""',
      position: "absolute",
      insetInlineStart: 0,
      top: "50%",
      width: "2px",
      height: "1.25rem",
      transform: "translateY(-50%)",
      backgroundColor: vars.color.action.indicator,
    },
  },
});

export const entry = style({ display: "flex" });

export const icon = style({ width: "1.125rem", height: "1.125rem" });

export const footer = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "1rem",
  marginBlockStart: "auto",
  paddingBlockStart: "0.875rem",
  "@media": { [media.touch]: { gap: "1rem" } },
});

export const account = style({
  ...target,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});
