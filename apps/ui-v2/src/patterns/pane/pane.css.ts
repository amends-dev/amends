import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

const ellipsis = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export const pane = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

const side = `${pane}[data-variant="side"]`;

/**
 * Parts place themselves in named areas, so one header rearranges per layout: a 60px bar with
 * the leading control, title, and actions; then tabs or a subtitle. Desktop headers are 96px and
 * touch headers 104px, so main and side panes line up. On phones a side pane moves its title
 * under a Back bar.
 */
export const header = style({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  gridTemplateRows: "3.75rem auto auto",
  gridTemplateAreas: '"leading title actions" "tabs tabs tabs" "subtitle subtitle subtitle"',
  alignContent: "start",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "6rem",
  paddingInline: "1.5rem",
  // Drawn inside the header, so the current tab's underline sits over it as in the mocks.
  boxShadow: `inset 0 -1px 0 ${vars.color.border.divider}`,
  "@media": {
    [media.touch]: { minHeight: "6.5rem" },
    [media.mobile]: {
      paddingInline: "1rem",
      selectors: {
        [`${side} &`]: {
          gridTemplateRows: "3.5rem auto auto",
          gridTemplateAreas: '"leading . actions" "title title title" "subtitle subtitle subtitle"',
          minHeight: "7rem",
        },
      },
    },
  },
});

// Leading controls sit 8px from the pane's edge, 8px before the title.
export const leading = style({
  gridArea: "leading",
  alignSelf: "center",
  marginInlineStart: "-1rem",
  marginInlineEnd: "0.5rem",
  "@media": { [media.mobile]: { marginInlineStart: "-0.5rem" } },
});

export const back = style([
  leading,
  {
    ...typeScale.body,
    display: "none",
    alignItems: "center",
    gap: "0.25rem",
    minHeight: "2.75rem",
    padding: 0,
    border: "none",
    background: "transparent",
    color: vars.color.text.primary,
    fontFamily: "inherit",
    fontWeight: fontWeight.medium,
    cursor: "pointer",
    selectors: {
      "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "-2px" },
    },
    "@media": { [media.mobile]: { display: "flex" } },
  },
]);

export const backIcon = style({
  display: "grid",
  placeItems: "center",
  width: "2.75rem",
  height: "2.75rem",
  color: vars.color.text.secondary,
});

export const title = style({
  gridArea: "title",
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minWidth: 0,
  selectors: { [`${side} &`]: { gap: "0.6875rem" } },
  "@media": {
    [media.mobile]: { selectors: { [`${side} &`]: { paddingBlockStart: "0.25rem" } } },
  },
});

export const titleIcon = style({
  flex: "none",
  width: "1.25rem",
  height: "1.25rem",
  color: vars.color.text.primary,
  selectors: {
    [`${side} &`]: { width: "1.125rem", height: "1.125rem", color: vars.color.text.secondary },
  },
  "@media": {
    // Touch layouts drop the main title's icon; phones drop the side title's too.
    [media.touch]: { selectors: { [`${pane}:not([data-variant="side"]) &`]: { display: "none" } } },
    [media.mobile]: { display: "none" },
  },
});

export const titleText = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const heading = style({
  ...typeScale.title,
  ...ellipsis,
  margin: 0,
  fontWeight: fontWeight.medium,
  selectors: { [`${side} &`]: typeScale.body },
  "@media": {
    [media.touch]: {
      selectors: { [`${pane}:not([data-variant="side"]) &`]: typeScale.titleTouch },
    },
    [media.mobile]: { selectors: { [`${side} &`]: typeScale.titleTouch } },
  },
});

// The main pane's context line, such as the workspace name, shows on phones only.
export const context = style({
  ...typeScale.control,
  ...ellipsis,
  display: "none",
  lineHeight: "1.125rem",
  color: vars.color.text.secondary,
  "@media": { [media.mobile]: { display: "block" } },
});

export const actions = style({
  gridArea: "actions",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  selectors: { [`${side} &`]: { marginInlineEnd: "-0.5rem" } },
  "@media": {
    [media.touch]: { gap: "0.25rem", marginInlineEnd: "-1rem" },
    [media.mobile]: { marginInlineEnd: "-0.75rem" },
  },
});

// Phones close a side pane with Back instead.
export const close = style({ "@media": { [media.mobile]: { display: "none" } } });

export const tabs = style({ gridArea: "tabs", minWidth: 0, alignSelf: "end" });

export const subtitle = style({
  ...typeScale.control,
  ...ellipsis,
  gridArea: "subtitle",
  margin: 0,
  lineHeight: "1.125rem",
  paddingBlock: "0.375rem 0.75rem",
  color: vars.color.text.secondary,
  "@media": {
    [media.mobile]: { selectors: { [`${side} &`]: { paddingBlock: "0.1875rem 0.375rem" } } },
  },
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "1.25rem 1.5rem",
  "@media": {
    [media.touch]: { padding: "1rem 1.5rem" },
    [media.mobile]: { padding: "1rem" },
  },
});

export const footer = style({
  flex: "none",
  padding: "1.25rem 1.5rem",
  "@media": {
    [media.touch]: { padding: "1rem 1.5rem" },
    [media.mobile]: {
      padding: "0 1rem",
      paddingBlockEnd: "max(0.5rem, env(safe-area-inset-bottom))",
    },
  },
});
