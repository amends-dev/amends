import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// The search, then the results scrolling under it, then how to use it.
export const jump = style({ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 });

export const search = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  flex: "none",
  padding: "0.75rem 0.75rem 0.75rem 1.25rem",
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  "@media": { [media.mobile]: { paddingInlineStart: "1rem" } },
});

export const searchIcon = style({
  flex: "none",
  width: "1.125rem",
  height: "1.125rem",
  color: vars.color.text.muted,
});

export const input = style({
  ...typeScale.title,
  flex: 1,
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  selectors: { "&::placeholder": { color: vars.color.text.muted, opacity: 1 } },
  "@media": { [media.mobile]: typeScale.titleTouch },
});

export const close = style({ flex: "none" });

export const results = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "0.5rem",
});

export const sectionTitle = style({
  ...typeScale.meta,
  margin: 0,
  padding: "0.75rem 0.75rem 0.375rem",
  color: vars.color.text.muted,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
});

export const item = style({
  ...typeScale.item,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  minHeight: "2.25rem",
  paddingInline: "0.75rem",
  color: vars.color.text.primary,
  cursor: "pointer",
  selectors: { "&[aria-selected=true]": { backgroundColor: vars.color.surface.selected } },
  "@media": { [media.touch]: { minHeight: "2.75rem" } },
});

export const itemIcon = style({
  flex: "none",
  width: "1.125rem",
  height: "1.125rem",
  color: vars.color.text.secondary,
});

export const itemLabel = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const itemDetail = style({
  ...typeScale.control,
  flex: "none",
  marginInlineStart: "auto",
  color: vars.color.text.muted,
});

export const empty = style({
  ...typeScale.control,
  margin: 0,
  padding: "1.5rem 0.75rem",
  color: vars.color.text.secondary,
});

// Keys to use it by, where there is a keyboard to press them.
export const hints = style({
  ...typeScale.meta,
  display: "flex",
  gap: "1.25rem",
  flex: "none",
  margin: 0,
  padding: "0.625rem 1.25rem",
  boxShadow: `inset 0 1px 0 ${vars.color.border.divider}`,
  color: vars.color.text.muted,
  "@media": { [media.touch]: { display: "none" } },
});

export const key = style({
  display: "inline-block",
  minWidth: "1rem",
  marginInlineEnd: "0.25rem",
  paddingInline: "0.25rem",
  border: `1px solid ${vars.color.border.default}`,
  fontFamily: "inherit",
  textAlign: "center",
});
