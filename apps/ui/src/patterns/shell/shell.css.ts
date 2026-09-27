import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media, shell } from "../../foundations/layout/tokens.ts";

const sidebarPart = '[data-shell-part="sidebar"]';

// The canvas frames the panels with an 8px gutter; on phones the pane runs edge to edge.
export const root = style({
  display: "flex",
  boxSizing: "border-box",
  height: "100dvh",
  minHeight: 0,
  paddingBlock: shell.gap,
  paddingInlineEnd: shell.gap,
  overflow: "hidden",
  backgroundColor: vars.color.surface.canvas,
  "@media": {
    [media.mobile]: {
      padding: 0,
      paddingTop: "env(safe-area-inset-top)",
      backgroundColor: vars.color.surface.panel,
    },
  },
});

export const navigation = style({
  position: "relative",
  display: "flex",
  flex: "none",
  gap: shell.gap,
  minHeight: 0,
  marginInlineEnd: shell.gap,
  "@media": {
    [media.mobile]: {
      display: "none",
      margin: 0,
      selectors: {
        "&[data-open]": {
          display: "flex",
          position: "fixed",
          insetBlock: 0,
          insetInlineStart: 0,
          zIndex: 31,
          paddingTop: "env(safe-area-inset-top)",
          backgroundColor: vars.color.surface.canvas,
        },
      },
    },
    // With the rail always shown, the drawer's sidebar sits above the content next to it.
    [media.touch]: {
      selectors: {
        "&[data-open]": { zIndex: 31, backgroundColor: vars.color.surface.canvas },
      },
    },
  },
});

globalStyle(`${navigation} > ${sidebarPart}`, {
  "@media": {
    [media.touch]: { display: "none" },
  },
});
globalStyle(`${navigation}[data-open] > ${sidebarPart}`, {
  "@media": {
    [media.touch]: {
      display: "flex",
      position: "absolute",
      insetBlock: 0,
      insetInlineStart: `calc(${shell.rail} + ${shell.gap})`,
      width: `min(${shell.sidebar}, calc(100vw - ${shell.rail} - ${shell.gap} - 4rem))`,
      // The canvas continues across the gap between rail and sidebar.
      boxShadow: `calc(-1 * ${shell.gap}) 0 0 0 ${vars.color.surface.canvas}`,
    },
  },
});

// On phones the whole drawer is fixed, so the sidebar returns to the row beside the rail.
globalStyle(`${navigation}[data-open] > ${sidebarPart}`, {
  "@media": { [media.mobile]: { position: "static" } },
});

export const navigationScrim = style({
  position: "fixed",
  inset: 0,
  zIndex: 30,
  backgroundColor: vars.color.scrimStrong,
  "@media": { [media.desktop]: { display: "none" } },
});

// 12px beyond the drawer's edge, as in the phone mock.
export const navigationClose = style({
  position: "absolute",
  top: "calc(env(safe-area-inset-top) + 0.375rem)",
  insetInlineStart: `calc(${shell.rail} + ${shell.gap} + ${shell.sidebar} + 0.75rem)`,
  backgroundColor: vars.color.surface.panel,
  "@media": { [media.desktop]: { display: "none" } },
});

export const main = style({
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  backgroundColor: vars.color.surface.panel,
});

// Side by side from the split width: the panel joins the main card across a divider.
export const aside = style({
  display: "flex",
  flexDirection: "column",
  flex: "none",
  minHeight: 0,
  width: shell.aside,
  backgroundColor: vars.color.surface.panel,
  borderInlineStart: `1px solid ${vars.color.border.divider}`,
  outline: "none",
  "@media": {
    [media.overlay]: {
      position: "fixed",
      insetBlock: shell.gap,
      insetInlineEnd: shell.gap,
      zIndex: 21,
      width: `min(${shell.aside}, calc(100vw - 2 * ${shell.gap}))`,
      border: "none",
    },
    [media.mobile]: {
      inset: 0,
      width: "auto",
      paddingTop: "env(safe-area-inset-top)",
    },
  },
});

// The wrapper an Aside rendered inside Main attaches through; it leaves no box of its own.
export const attached = style({ display: "contents" });

export const asideScrim = style({
  display: "none",
  "@media": {
    [media.overlay]: {
      display: "block",
      position: "fixed",
      inset: 0,
      zIndex: 20,
      backgroundColor: vars.color.scrim,
    },
    [media.mobile]: { display: "none" },
  },
});

// In a pane header, the toggle leads the title below desktop and is absent above it.
export const toggle = style({
  gridArea: "leading",
  alignSelf: "center",
  marginInlineStart: "-1rem",
  marginInlineEnd: "0.5rem",
  "@media": {
    [media.desktop]: { display: "none" },
    [media.mobile]: { marginInlineStart: "-0.5rem" },
  },
});

export const skip = style({
  position: "fixed",
  insetInlineStart: shell.gap,
  top: shell.gap,
  zIndex: 40,
  padding: "0.5rem 0.75rem",
  backgroundColor: vars.color.surface.panel,
  color: vars.color.text.primary,
  transform: "translateY(-200%)",
  selectors: {
    "&:focus-visible": {
      transform: "none",
      outline: `2px solid ${vars.color.text.primary}`,
    },
  },
});
