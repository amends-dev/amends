import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// Avatar, then a column of author line, text, and extras 4px apart.
export const message = style({
  position: "relative",
  // Its own layer, so the hover band sits behind its content but in front of the pane.
  isolation: "isolate",
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
    // A message stacked under its author's one before sits 6px beneath it, inside the
    // timeline's 24px gap (22px on phones); marked out, its band reaches up 8px more.
    "&[data-continued]": { marginBlockStart: "-1.125rem" },
    "&[data-continued][data-active]": { marginBlockStart: "-1.625rem" },
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
  "@media": {
    [media.mobile]: {
      selectors: {
        "&[data-continued]": { marginBlockStart: "-1rem" },
        "&[data-continued][data-active]": { marginBlockStart: "-1.5rem" },
      },
    },
    // Under the pointer, a quiet band reaching as the open thread's does, behind the text.
    "(hover: hover)": {
      selectors: {
        "&:hover:not([data-active])::after": {
          content: '""',
          position: "absolute",
          inset: "-0.375rem -0.75rem",
          zIndex: -1,
          backgroundColor: vars.color.surface.hover,
          pointerEvents: "none",
        },
      },
    },
  },
});

// Actions float over the message's top right edge, as a popover does, while it is under the
// pointer or holds focus. Touch screens reply from Reply instead.
export const actions = style({
  position: "absolute",
  top: "-1.125rem",
  insetInlineEnd: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  gap: "0.125rem",
  padding: "0.125rem",
  border: `1px solid ${vars.color.border.default}`,
  backgroundColor: vars.color.surface.popover,
  boxShadow: vars.shadow.popover,
  opacity: 0,
  pointerEvents: "none",
  selectors: {
    [`${message}:hover &, ${message}:focus-within &`]: { opacity: 1, pointerEvents: "auto" },
  },
  "@media": { "(hover: none)": { display: "none" } },
});

// A stacked message's time, in the avatar's place, while the pointer or focus is on it.
export const gutterTime = style({
  ...typeScale.meta,
  lineHeight: typeScale.body.lineHeight,
  justifySelf: "end",
  color: vars.color.text.muted,
  whiteSpace: "nowrap",
  visibility: "hidden",
  selectors: { [`${message}:hover &, ${message}:focus-within &`]: { visibility: "visible" } },
  "@media": { [media.mobile]: { lineHeight: typeScale.bodyTouch.lineHeight } },
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

// A stacked message's byline, for assistive technology only.
export const hiddenByline = style({
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
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
  minWidth: 0,
  color: vars.color.text.primary,
  overflowWrap: "anywhere",
  "@media": { [media.mobile]: typeScale.bodyTouch },
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

// A dot before the count while the thread has replies the reader has not seen.
export const unread = style({
  display: "inline-block",
  width: "0.4375rem",
  height: "0.4375rem",
  marginInlineEnd: "0.4375rem",
  borderRadius: "50%",
  backgroundColor: vars.color.action.indicator,
});

export const repliesNote = style({
  ...typeScale.meta,
  color: vars.color.text.muted,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

// "Reply in thread" shows where there is no pointer, or while it notes typing or an agent's work.
export const reply = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.625rem",
  alignSelf: "flex-start",
  minHeight: "1.5rem",
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.muted,
  fontFamily: "inherit",
  cursor: "pointer",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "2px" },
  },
  "@media": { "(hover: hover)": { selectors: { "&:not([data-noted])": { display: "none" } } } },
});

// Where there is a pointer, the message's Actions offer the reply, so only what it notes shows.
export const replyLabel = style({
  ...typeScale.control,
  fontWeight: fontWeight.medium,
  "@media": { "(hover: hover)": { display: "none" } },
});
