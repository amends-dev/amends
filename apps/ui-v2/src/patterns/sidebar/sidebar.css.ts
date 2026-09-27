import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media, shell } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const focusInset = {
  "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
} as const;

// The 2px bar beside the current row.
const indicator = {
  content: '""',
  position: "absolute",
  insetInlineStart: 0,
  top: "50%",
  width: "2px",
  height: "1.25rem",
  transform: "translateY(-50%)",
  backgroundColor: vars.color.action.indicator,
} as const;

export const sidebar = style({
  display: "flex",
  flexDirection: "column",
  flex: "none",
  width: shell.sidebar,
  minHeight: 0,
  overflow: "hidden",
  backgroundColor: vars.color.surface.panel,
});

// 96px on desktop, the same height as the pane headers beside it.
export const header = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "6rem",
  padding: "1.0625rem 1.125rem 0.4375rem",
  borderBlockEnd: `1px solid ${vars.color.border.divider}`,
  "@media": {
    [media.touch]: { gap: "0.25rem", minHeight: 0, padding: "0 0.5rem 0", border: "none" },
  },
});

export const workspace = style({
  ...typeScale.body,
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  boxSizing: "border-box",
  width: "100%",
  height: "1.75rem",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: "inherit",
  fontWeight: fontWeight.semibold,
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": {
    [media.touch]: { ...typeScale.item, height: "3.5rem", paddingInline: "0.5rem" },
  },
});

export const workspaceName = style(ellipsis);

export const chevron = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  marginInlineStart: "auto",
  color: vars.color.text.secondary,
  selectors: { [`${workspace}:hover &`]: { color: vars.color.text.primary } },
});

export const search = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  width: "100%",
  height: "1.875rem",
  paddingInline: "0.625rem",
  border: "none",
  backgroundColor: vars.color.surface.search,
  color: vars.color.text.muted,
  fontFamily: "inherit",
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.secondary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": {
    [media.touch]: {
      ...typeScale.item,
      height: "2.75rem",
      marginInline: "0.5rem",
      width: "auto",
      paddingInline: "0.75rem",
      backgroundColor: vars.color.surface.subtle,
      color: vars.color.text.secondary,
    },
  },
});

export const searchIcon = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  "@media": { [media.touch]: { width: "1rem", height: "1rem" } },
});

export const searchLabel = style({ ...ellipsis, flex: 1 });

export const shortcut = style({
  ...typeScale.meta,
  flex: "none",
  fontFamily: "inherit",
  "@media": { [media.touch]: { display: "none" } },
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "0.9375rem 0.75rem 1rem",
  "@media": { [media.touch]: { padding: "1rem 0.5rem" } },
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const item = style({
  ...typeScale.item,
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  boxSizing: "border-box",
  height: "2.375rem",
  paddingInline: "0.75rem",
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    ...focusInset,
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&[aria-current]": {
      backgroundColor: vars.color.surface.selected,
      color: vars.color.text.primary,
      fontWeight: fontWeight.medium,
    },
    "&[aria-current]::before": indicator,
  },
  "@media": { [media.touch]: { ...typeScale.body, height: "2.75rem" } },
});

// Item icons stay secondary even on the current row.
export const itemIcon = style({
  flex: "none",
  width: "1.0625rem",
  height: "1.0625rem",
  color: vars.color.text.secondary,
  "@media": { [media.touch]: { width: "1.125rem", height: "1.125rem" } },
});

export const itemAvatar = style({
  "@media": { [media.touch]: { width: "1.75rem", height: "1.75rem", fontSize: "0.63rem" } },
});

export const itemLabel = style({ ...ellipsis, flex: 1 });

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  marginBlockStart: "1.375rem",
  "@media": { [media.touch]: { gap: "0.25rem", marginBlockStart: "0.5rem" } },
});

export const sectionHeader = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  height: "1.75rem",
  paddingInlineStart: "0.5rem",
  selectors: {
    "&[data-current]": { backgroundColor: vars.color.surface.selected },
    "&[data-current]::before": indicator,
  },
  "@media": { [media.touch]: { height: "2.75rem", paddingInlineStart: "0.75rem" } },
});

export const sectionTitle = style({
  ...typeScale.meta,
  ...ellipsis,
  flex: 1,
  color: vars.color.text.muted,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  textDecoration: "none",
  selectors: {
    ...focusInset,
    [`${sectionHeader}[data-current] &`]: { color: vars.color.text.primary },
    // A linked title makes the whole row clickable; the actions sit above that area.
    "a&::after": { content: '""', position: "absolute", inset: 0 },
  },
  "@media": { [media.touch]: { color: vars.color.text.secondary } },
});

export const sectionActions = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  "@media": { [media.touch]: { gap: 0 } },
});

// A thread or task under its group, joined by a stitched elbow.
export const subItem = style({
  ...typeScale.hint,
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  boxSizing: "border-box",
  height: "2rem",
  marginInlineStart: "2.3125rem",
  paddingInline: "0.5rem",
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    ...focusInset,
    "&:hover": { backgroundColor: vars.color.surface.hover },
    "&[aria-current]": {
      backgroundColor: vars.color.surface.selected,
      color: vars.color.text.primary,
    },
    "&[aria-current]::before": indicator,
  },
  "@media": { [media.touch]: { ...typeScale.control, height: "2.75rem" } },
});

// Runs from just under the group's row to the middle of this one; the drawing is anchored at
// its bottom, so taller touch rows only lengthen the vertical run.
export const connector = style({
  position: "absolute",
  insetInlineStart: "-1.1875rem",
  top: "-0.25rem",
  width: "1.125rem",
  height: "calc(50% + 0.28125rem)",
  color: vars.color.border.stitch,
  pointerEvents: "none",
});

export const subItemIcon = style({
  flex: "none",
  width: "0.875rem",
  height: "0.875rem",
  color: vars.color.text.secondary,
});
