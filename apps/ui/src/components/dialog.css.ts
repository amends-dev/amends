import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint } from "../tokens/index.ts";

globalStyle("html:has(dialog[data-amends-modal][open])", { overflow: "hidden" });
const enterFromEnd = keyframes({
  from: { transform: "translateX(100%)" },
  to: { transform: "translateX(0)" },
});
const enterFromStart = keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(0)" },
});
export const dialog = style({
  width: "min(32rem, calc(100% - 2rem))",
  maxHeight: "calc(100dvh - 2rem)",
  margin: "auto",
  padding: 0,
  overflow: "visible",
  overscrollBehavior: "contain",
  border: `1px solid ${vars.color.line.subtle}`,
  borderRadius: vars.radius.dialog,
  background: vars.color.surface.panel,
  color: vars.color.text.primary,
  boxShadow: vars.shadow.modal,
  selectors: {
    '&[data-placement="start"][open]': {
      animation: `${enterFromStart} ${vars.duration.settle} ${vars.easing.settle}`,
    },
    '&[data-placement="end"]': {
      width: "min(25rem, calc(100% - 1.5rem))",
      height: "100dvh",
      maxHeight: "100dvh",
      margin: "0 0 0 auto",
      border: 0,
      borderInlineStart: `1px dashed ${vars.color.line.subtle}`,
      borderRadius: 0,
      background: vars.color.surface.canvas,
      boxShadow: "none",
    },
    '&[data-placement="end"][open]': {
      animation: `${enterFromEnd} ${vars.duration.settle} ${vars.easing.settle}`,
    },
    "&::backdrop": { background: vars.color.surface.scrim },
    '&[data-placement="start"]': {
      width: "min(20rem, calc(100% - 2rem))",
      height: "100dvh",
      maxHeight: "100dvh",
      margin: "0 auto 0 0",
      border: 0,
      borderRadius: 0,
    },
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none !important" },
    [`(max-width: ${breakpoint.navigation - 1}px)`]: {
      selectors: {
        '&[data-placement="end"]': { width: "100%", maxWidth: "100%", borderInlineStart: 0 },
      },
    },
  },
});
export const content = style({
  position: "relative",
  maxHeight: "calc(100dvh - 2rem)",
  overflowY: "auto",
  padding: vars.space[6],
  display: "grid",
  gap: vars.space[6],
  selectors: {
    [`${dialog}[data-placement="end"] &`]: {
      maxHeight: "100dvh",
      paddingBlock:
        "max(1.5rem, env(safe-area-inset-top)) max(1.5rem, env(safe-area-inset-bottom))",
    },
    [`${dialog}[data-placement="start"] &`]: {
      maxHeight: "100dvh",
      minHeight: "100%",
      alignContent: "start",
      padding: "max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))",
    },
    [`${dialog}[data-content-layout="fill"] &`]: {
      height: "100%",
      maxHeight: "100%",
      minHeight: 0,
      padding: 0,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      overflow: "hidden",
    },
  },
});
export const heading = style({ margin: 0, overflowWrap: "anywhere" });
export const description = style({
  margin: 0,
  color: vars.color.text.secondary,
  overflowWrap: "anywhere",
});
export const header = style({ position: "relative", display: "grid", gap: vars.space[3] });
export const withClose = style({ paddingInlineEnd: vars.space[12] });
export const close = style({
  position: "absolute",
  // The positioned title row paints later, including its reserved space for this button.
  zIndex: 1,
  right: vars.space[6],
  top: vars.space[6],
  selectors: {
    [`${dialog}[data-placement="start"] &`]: {
      right: vars.space[4],
      top: "max(1rem, env(safe-area-inset-top))",
    },
  },
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: vars.space[3],
});
export const error = style({ color: vars.color.status.danger.text, margin: 0 });
