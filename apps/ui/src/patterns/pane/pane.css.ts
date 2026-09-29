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
const modal = `${pane}[data-variant="modal"]`;

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
  selectors: {
    // Modals: a 64px title bar, then tabs or a subtitle; no fixed band to line up with.
    [`${modal} &`]: { gridTemplateRows: "4rem auto auto", minHeight: 0 },
  },
  "@media": {
    [media.touch]: {
      minHeight: "6.5rem",
      selectors: { [`${modal} &`]: { minHeight: 0 } },
    },
    [media.mobile]: {
      paddingInline: "1rem",
      selectors: {
        [`${side} &`]: {
          gridTemplateRows: "3.5rem auto auto auto",
          gridTemplateAreas:
            '"leading . actions" "title title title" "tabs tabs tabs" "subtitle subtitle subtitle"',
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

export const backAlways = style({ display: "flex" });

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
  justifyContent: "flex-start",
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

// A person's avatar in place of the icon, dropped on touch layouts like it.
export const titleAvatar = style({
  flex: "none",
  "@media": { [media.touch]: { display: "none" } },
});

// Words for assistive technology only, such as the title avatar's status.
export const hidden = style({
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
});

export const titleText = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  selectors: { [`${modal} &`]: { flexDirection: "row", alignItems: "baseline", gap: "0.75rem" } },
  "@media": {
    [media.mobile]: { selectors: { [`${modal} &`]: { flexDirection: "column", gap: 0 } } },
  },
});

export const heading = style({
  ...typeScale.title,
  ...ellipsis,
  margin: 0,
  fontWeight: fontWeight.medium,
  selectors: { [`${side} &`]: typeScale.body, [`${modal} &`]: typeScale.heading },
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
  selectors: { [`${modal} &`]: { ...typeScale.hint, display: "block" } },
  "@media": { [media.mobile]: { display: "block" } },
});

export const actions = style({
  gridArea: "actions",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  selectors: { [`${side} &`]: { marginInlineEnd: "-0.5rem" } },
  "@media": {
    [media.touch]: {
      gap: "0.25rem",
      marginInlineEnd: "-1rem",
      selectors: { [`${modal} &`]: { marginInlineEnd: "-0.5rem" } },
    },
    [media.mobile]: { marginInlineEnd: "-0.75rem" },
  },
});

// Phones close a side pane with Back instead; modals keep their close button.
export const close = style({
  "@media": { [media.mobile]: { selectors: { [`${side} &`]: { display: "none" } } } },
});

export const tabs = style({
  gridArea: "tabs",
  minWidth: 0,
  alignSelf: "end",
  selectors: { [`${modal} &`]: { paddingBlockStart: "0.25rem" } },
});

// Controls above a list that stay while it scrolls, such as search and filters.
// One row where the search gives way first; phones wrap it onto its own line.
export const toolbar = style({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  flex: "none",
  padding: "1.25rem 1.5rem 0",
  "@media": {
    [media.touch]: { paddingBlockStart: "1rem" },
    [media.mobile]: { flexWrap: "wrap", padding: "0.75rem 1rem 0" },
  },
});

export const toolbarEnd = style({
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  marginInlineStart: "auto",
  "@media": { [media.mobile]: { marginInlineStart: 0 } },
});

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
  selectors: {
    [`${modal} &`]: { padding: "1.5rem" },
    // A list directly under a toolbar and its headings starts at the top edge.
    "&[data-inset=list]": { paddingBlockStart: 0 },
  },
  "@media": {
    [media.touch]: { padding: "1rem 1.5rem" },
    [media.mobile]: { padding: "1rem", selectors: { [`${modal} &`]: { padding: "1rem" } } },
  },
});

// One column of sections for a page about one item; nothing sits beside it.
export const column = style({
  display: "flex",
  flexDirection: "column",
  gap: "2.5rem",
  maxWidth: "42.5rem",
  paddingBlockStart: "0.25rem",
  "@media": { [media.mobile]: { gap: "2rem" } },
});

export const footer = style({
  flex: "none",
  padding: "1.25rem 1.5rem",
  selectors: {
    "&[data-divided]": {
      boxShadow: `inset 0 1px 0 ${vars.color.border.divider}`,
      paddingBlock: "1.5rem",
    },
  },
  "@media": {
    [media.touch]: { padding: "1rem 1.5rem" },
    [media.mobile]: {
      padding: "0 1rem",
      paddingBlockEnd: "max(0.5rem, env(safe-area-inset-bottom))",
    },
  },
});
