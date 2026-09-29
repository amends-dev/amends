import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const list = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

// A day seam: 20px above the first, 8px under each.
export const day = style({
  paddingBlock: "1.25rem 0.5rem",
  selectors: { "&:first-child": { paddingBlockStart: 0 } },
});

// 104px rows: the avatar 16px down, the text column 13px down. The selected row takes a quiet
// band reaching 12px past the column, with the current-item bar at its edge, like an open thread.
export const row = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr)",
  columnGap: "0.75rem",
  alignItems: "start",
  boxSizing: "border-box",
  minHeight: "6.5rem",
  marginInline: "-0.75rem",
  padding: "1rem 0.75rem 1rem",
  selectors: {
    "&[data-link]:hover": { backgroundColor: vars.color.surface.hover },
    "&[data-selected]": { backgroundColor: vars.color.surface.active },
    "&[data-selected]::before": {
      content: '""',
      position: "absolute",
      insetInlineStart: 0,
      top: "1.375rem",
      width: "2px",
      height: "1.25rem",
      backgroundColor: vars.color.action.indicator,
    },
    "&:has(a:focus-visible)": {
      outline: `2px solid ${vars.color.text.primary}`,
      outlineOffset: "-2px",
    },
  },
});

export const unavailable = style({
  display: "grid",
  placeItems: "center",
  width: "2rem",
  height: "2rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary,
});

export const unavailableIcon = style({ width: "1rem", height: "1rem" });

export const text = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  marginBlockStart: "-0.1875rem",
});

export const head = style({
  display: "flex",
  alignItems: "baseline",
  gap: "1rem",
  minWidth: 0,
});

// The title links the whole row.
export const title = style({
  ...typeScale.item,
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.primary,
  textDecoration: "none",
  outline: "none",
  selectors: {
    "a&::after": { content: '""', position: "absolute", inset: 0 },
    [`${row}[data-unread] &`]: { fontWeight: fontWeight.medium },
  },
});

export const meta = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.625rem",
  flex: "none",
  color: vars.color.text.secondary,
});

export const dot = style({
  width: "0.375rem",
  height: "0.375rem",
  borderRadius: "50%",
  backgroundColor: vars.color.action.indicator,
});

export const place = style({
  ...typeScale.hint,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: vars.color.text.secondary,
});

// What was said, on one line ending in an ellipsis when there is more; quieter once seen.
export const preview = style({
  ...typeScale.body,
  margin: 0,
  marginBlockStart: "0.375rem",
  overflow: "hidden",
  color: vars.color.text.secondary,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: { [`${row}[data-unread] &`]: { color: vars.color.text.primary } },
  "@media": { [media.mobile]: typeScale.bodyTouch },
});

export const loading = style({
  ...typeScale.control,
  margin: "auto",
  color: vars.color.text.secondary,
});

export const earlier = style({
  display: "flex",
  justifyContent: "center",
  paddingBlock: "1rem",
});
