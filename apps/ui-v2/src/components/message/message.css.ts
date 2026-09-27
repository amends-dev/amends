import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// Avatar, then a column of author line, text, and extras 4px apart.
export const message = style({
  position: "relative",
  display: "grid",
  gridTemplateColumns: "2rem minmax(0, 1fr)",
  columnGap: "0.75rem",
  alignItems: "start",
  selectors: {
    // The message whose thread is open: a quiet band reaching 12px past the column, with the
    // current-item bar at its edge.
    "&[data-active]": {
      marginInline: "-0.75rem",
      marginBlock: "-0.5rem",
      paddingInline: "0.75rem",
      paddingBlock: "0.5rem",
      backgroundColor: vars.color.surface.active,
    },
    "&[data-active]::before": {
      content: '""',
      position: "absolute",
      insetInlineStart: 0,
      top: "0.875rem",
      width: "2px",
      height: "1.25rem",
      backgroundColor: vars.color.action.indicator,
    },
  },
});

export const content = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  minWidth: 0,
});

export const byline = style({
  display: "flex",
  alignItems: "baseline",
  gap: "0.625rem",
  minWidth: 0,
  "@media": { [media.touch]: { gap: "0.5rem" } },
});

export const author = style({
  ...typeScale.item,
  fontWeight: fontWeight.medium,
  color: vars.color.text.primary,
  selectors: { "&[data-agent]": { color: vars.color.text.agent } },
});

export const time = style({
  ...typeScale.meta,
  color: vars.color.text.muted,
  whiteSpace: "nowrap",
  "@media": {
    [media.touch]: { color: vars.color.text.secondary },
    [media.mobile]: { ...typeScale.control, lineHeight: "1.125rem" },
  },
});

export const text = style({
  ...typeScale.body,
  margin: 0,
  color: vars.color.text.primary,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
  "@media": { [media.mobile]: typeScale.bodyTouch },
});

export const mention = style({
  paddingInline: "0.1875rem",
  backgroundColor: vars.color.surface.mention,
  fontWeight: fontWeight.semibold,
});

export const activity = style({
  ...typeScale.control,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  color: vars.color.text.muted,
});

export const activityIcon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });

export const extras = style({
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  alignItems: "center",
});

// A 28px chip; phones keep a 44px target around it.
export const reaction = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  boxSizing: "border-box",
  height: "1.75rem",
  paddingInline: "0.5rem",
  border: "1px solid transparent",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary,
  fontFamily: "inherit",
  cursor: "pointer",
  selectors: {
    "&:hover": { borderColor: vars.color.border.default },
    // Your own reaction; a proposal, since the mocks show only others' reactions.
    "&[aria-pressed=true]": { borderColor: vars.color.border.strong },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": {
    [media.mobile]: {
      height: "2.75rem",
      backgroundClip: "content-box",
      paddingBlock: "0.5rem",
      color: vars.color.text.primary,
    },
  },
});

export const emoji = style({
  ...typeScale.item,
  "@media": { [media.touch]: { fontSize: "0.9375rem" } },
});

export const reactionCount = style({
  ...typeScale.hint,
  fontWeight: fontWeight.medium,
  fontVariantNumeric: "tabular-nums",
  "@media": { [media.touch]: typeScale.control },
});

export const task = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  alignSelf: "flex-start",
  boxSizing: "border-box",
  maxWidth: "100%",
  minHeight: "2rem",
  marginBlockStart: "0.75rem",
  paddingInline: "0.625rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    "&:hover": { borderColor: vars.color.border.strong },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": { [media.mobile]: { minHeight: "2.75rem" } },
});

export const taskKey = style({ fontWeight: fontWeight.medium, color: vars.color.text.primary });

export const taskTitle = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// The thread summary: who replied and how many, reached from the avatar by a stitched elbow.
export const replies = style({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.75rem",
  alignSelf: "flex-start",
  boxSizing: "border-box",
  height: "2.25rem",
  padding: 0,
  // Centers the 28px contents 22px down, level with the elbow's end.
  paddingBlockStart: "0.5rem",
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": { [media.mobile]: { height: "2.75rem", paddingBlockStart: 0 } },
});

export const repliesConnector = style({
  position: "absolute",
  insetInlineStart: "-1.75rem",
  top: 0,
  width: "1.125rem",
  height: "1.4375rem",
  overflow: "visible",
  color: vars.color.border.stitch,
  pointerEvents: "none",
});

export const repliesCount = style({
  ...typeScale.control,
  display: "inline-flex",
  alignItems: "center",
  height: "1.625rem",
  paddingInline: "0.5rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  selectors: { [`${replies}:hover &`]: { color: vars.color.text.primary } },
  "@media": {
    [media.mobile]: { ...typeScale.item, lineHeight: "1.25rem", background: "transparent" },
  },
});
