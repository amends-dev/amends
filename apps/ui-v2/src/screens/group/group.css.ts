import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// The member stack opens the member list; it hides on phones, where the header is narrow.
export const members = style({
  display: "inline-grid",
  placeItems: "center",
  height: "2rem",
  paddingInline: "0.25rem",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  selectors: {
    "&:hover": { backgroundColor: vars.color.surface.subtle },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": {
    [media.touch]: { height: "2.75rem", marginInlineEnd: "0.5rem" },
    [media.mobile]: { display: "none" },
  },
});

// Phones show search in the group header instead of notifications.
export const desktopOnly = style({ "@media": { [media.mobile]: { display: "none" } } });
export const mobileOnly = style({
  display: "none",
  "@media": { [media.mobile]: { display: "inline-grid" } },
});

// The prompt to join a previewed group, in place of the composer.
export const prompt = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1.5rem",
  "@media": { [media.mobile]: { flexDirection: "column", alignItems: "stretch", gap: "0.75rem" } },
});

export const promptText = style({ display: "flex", flexDirection: "column", gap: "0.25rem" });

export const promptTitle = style({
  ...typeScale.item,
  margin: 0,
  color: vars.color.text.primary,
  fontWeight: fontWeight.medium,
});

export const promptNote = style({
  ...typeScale.control,
  margin: 0,
  color: vars.color.text.secondary,
});
