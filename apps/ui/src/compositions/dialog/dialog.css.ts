import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typography } from "../../foundations/typography/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

globalStyle("html:has(dialog[data-frontend-modal][open])", { overflow: "hidden" });
const enter = keyframes({
  from: { opacity: 0, transform: "translateY(-4px)" },
  to: { opacity: 1, transform: "none" },
});
const leave = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });
export const content = style({
  position: "fixed",
  inset: 0,
  margin: "auto",
  boxSizing: "border-box",
  width: "min(27.5rem, calc(100% - 3rem))",
  maxWidth: "none",
  maxHeight: "calc(100dvh - 3rem)",
  padding: "1.75rem 1.625rem 1.5rem",
  border: 0,
  borderRadius: "1.375rem",
  backgroundColor: colorVars.surface.panel,
  color: colorVars.text.primary,
  boxShadow: "0 8px 20px oklch(0.24 0.014 84 / 0.1), 0 30px 60px oklch(0.24 0.014 84 / 0.14)",
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  overflowY: "auto",
  overscrollBehavior: "contain",
  selectors: {
    "&:not([open])": { display: "none" },
    "&::backdrop": { backgroundColor: "oklch(0.24 0.014 84 / 0.45)" },
    '&[data-phase="open"][data-animated="true"]': { animation: `${enter} 180ms ease-out both` },
    '&[data-phase="closing"][data-animated="true"]': { animation: `${leave} 180ms ease-in both` },
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none !important" },
    "(forced-colors: active)": { border: "1px solid CanvasText", boxShadow: "none" },
    "(max-width: 30rem)": { width: "calc(100% - 2rem)", padding: space[4] },
  },
});
export const header = style({
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  flexShrink: 0,
});
export const title = style({
  ...typography.heading,
  fontSize: "1.625rem",
  lineHeight: 1.15,
  letterSpacing: "0em",
  margin: 0,
  outline: "none",
  overflowWrap: "anywhere",
});
export const description = style({
  ...typography.body,
  fontSize: "0.90625rem",
  margin: 0,
  color: colorVars.text.secondary,
  overflowWrap: "anywhere",
});
export const body = style({
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: space[1],
  margin: `-${space[1]}`,
});
export const footer = style({
  display: "flex",
  flexWrap: "wrap",
  flexShrink: 0,
  gap: "0.625rem",
  paddingTop: "0.375rem",
});
