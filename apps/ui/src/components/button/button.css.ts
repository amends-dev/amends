import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const button = style({
  ...typeScale.control,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.5rem",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "2.25rem",
  paddingInline: "1rem",
  margin: 0,
  border: "1px solid transparent",
  borderRadius: 0,
  fontFamily: "inherit",
  fontWeight: fontWeight.medium,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&:disabled, &[aria-disabled=true]": { cursor: "default" },
  },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

// Hover and pressed shades are proposals; the mocks show resting and disabled states.
export const variant = styleVariants({
  primary: {
    backgroundColor: vars.color.action.primary,
    color: vars.color.text.onPrimary,
    selectors: {
      "&:hover:not(:disabled)": { opacity: 0.88 },
      "&:disabled": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.disabled },
    },
  },
  secondary: {
    backgroundColor: vars.color.action.secondary,
    borderColor: vars.color.border.default,
    color: vars.color.text.primary,
    selectors: {
      "&:hover:not(:disabled)": { borderColor: vars.color.border.strong },
      "&[aria-expanded=true]": { borderColor: vars.color.border.strong },
      "&:disabled": {
        backgroundColor: vars.color.surface.subtle,
        borderColor: "transparent",
        color: vars.color.text.disabled,
      },
    },
  },
  /** Text-only, for row actions such as Remove and for pickers inside panels. */
  quiet: {
    ...typeScale.hint,
    minHeight: "2rem",
    paddingInline: "0.625rem",
    backgroundColor: "transparent",
    color: vars.color.text.secondary,
    fontWeight: fontWeight.regular,
    selectors: {
      "&:hover:not(:disabled)": {
        backgroundColor: vars.color.surface.subtle,
        color: vars.color.text.primary,
      },
      "&[aria-expanded=true]": { backgroundColor: vars.color.surface.subtle },
      "&:disabled": { color: vars.color.text.disabled },
    },
  },
});

/** 44px with item text, for centered screens such as sign-in. */
export const large = style({ ...typeScale.item, minHeight: "2.75rem", paddingInline: "1.25rem" });

/** Fills its container, as in phone action bars. */
export const wide = style({ width: "100%" });

/** A menu trigger with a chevron uses tighter padding. */
export const withChevron = style({ paddingInline: "0.75rem" });

export const icon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const chevron = style({
  flex: "none",
  width: "0.75rem",
  height: "0.75rem",
  color: vars.color.text.secondary,
});
