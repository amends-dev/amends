import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { typeScale } from "../../foundations/typography/tokens.ts";

// 42px, bordered, with reading-size text; 44px on touch and 16px text on phones.
export const input = style({
  ...typeScale.body,
  display: "block",
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
  outline: "none",
  selectors: {
    "&::placeholder": { color: vars.color.text.muted, opacity: 1 },
    "&:focus": { borderColor: vars.color.border.strong },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
    "&[aria-invalid=true]": { borderColor: vars.color.border.danger },
    "&:disabled": { backgroundColor: vars.color.surface.subtle, color: vars.color.text.disabled },
  },
  "@media": {
    [media.touch]: { minHeight: "2.75rem" },
    [media.mobile]: typeScale.bodyTouch,
  },
});

// Several lines: the Input's look with room above and below, resized by its rows only.
export const textarea = style({
  paddingBlock: "0.625rem",
  lineHeight: 1.5,
  resize: "none",
});

// The quiet search: a filled field without an outline.
export const search = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  flex: "0 1 20rem",
  minWidth: "8rem",
  "@media": {
    [media.touch]: { height: "2.75rem" },
    [media.mobile]: { flexBasis: "100%" },
  },
  boxSizing: "border-box",
  height: "2.25rem",
  backgroundColor: vars.color.surface.search,
  color: vars.color.text.muted,
  selectors: {
    "&:focus-within": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
});

export const searchIcon = style({
  position: "absolute",
  insetInlineStart: "0.75rem",
  width: "0.9375rem",
  height: "0.9375rem",
  pointerEvents: "none",
});

export const searchInput = style({
  ...typeScale.control,
  flex: 1,
  minWidth: 0,
  height: "100%",
  margin: 0,
  paddingInline: "2.1875rem 0.75rem",
  border: "none",
  outline: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  selectors: {
    "&::placeholder": { color: vars.color.text.muted, opacity: 1 },
    "&::-webkit-search-cancel-button": { display: "none" },
  },
  "@media": { [media.mobile]: typeScale.bodyTouch },
});
