import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";

globalStyle("html:has(dialog[data-frontend-modal][open])", { overflow: "hidden" });
const enter = keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(0)" },
});
const leave = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(-100%)" },
});
const enterRtl = keyframes({
  from: { transform: "translateX(100%)" },
  to: { transform: "translateX(0)" },
});
const leaveRtl = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(100%)" },
});
export const content = style({
  position: "fixed",
  insetBlock: 0,
  insetInlineStart: 0,
  insetInlineEnd: "auto",
  margin: 0,
  width: "min(20rem, calc(100% - 2rem))",
  maxWidth: "none",
  height: "100dvh",
  maxHeight: "100dvh",
  boxSizing: "border-box",
  padding: 0,
  border: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
  backgroundColor: colorVars.surface.panel,
  color: colorVars.text.primary,
  selectors: {
    "&:not([open])": { display: "none" },
    "&::backdrop": { backgroundColor: "oklch(0.17 0.008 84 / 0.55)" },
    '&[data-phase="open"][data-animated="true"]': { animation: `${enter} 180ms ease-out both` },
    '&[data-phase="closing"][data-animated="true"]': { animation: `${leave} 180ms ease-in both` },
    '&:dir(rtl)[data-phase="open"][data-animated="true"]': { animationName: enterRtl },
    '&:dir(rtl)[data-phase="closing"][data-animated="true"]': { animationName: leaveRtl },
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none !important" },
    "(forced-colors: active)": { borderInlineEnd: "1px solid CanvasText" },
  },
});
export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
  padding: space[4],
  paddingTop: `max(${space[4]}, env(safe-area-inset-top))`,
});
export const body = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: space[4],
});
export const footer = style({
  display: "flex",
  flexWrap: "wrap",
  gap: space[3],
  padding: space[4],
  paddingBottom: `max(${space[4]}, env(safe-area-inset-bottom))`,
  borderTop: `1px dashed ${colorVars.line.seam}`,
});
export const title = style([
  typographyStyles.heading,
  { margin: 0, minWidth: 0, overflowWrap: "anywhere", outline: "none" },
]);
export const description = style([
  typographyStyles.body,
  { margin: 0, color: colorVars.text.secondary },
]);
