import { keyframes, style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typography } from "../../foundations/typography/tokens.ts";
import { focus } from "../../foundations/focus/tokens.ts";
import { space } from "../../foundations/spacing/tokens.ts";

const arrive = keyframes({
  from: { opacity: 0, transform: "translateY(-4px)" },
  to: { opacity: 1, transform: "none" },
});
const keyboardFocus = style({
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width} solid ${colorVars.toast.text}`,
      outlineOffset: focus.offset,
    },
  },
  "@media": {
    "(forced-colors: active)": { selectors: { "&:focus-visible": { outlineColor: "Highlight" } } },
  },
});
export const viewport = style({
  position: "fixed",
  zIndex: 70,
  insetInline: 0,
  bottom: 0,
  pointerEvents: "none",
  boxSizing: "border-box",
});
export const list = style({
  margin: 0,
  // Keep shadows and focus within the scrollport while placing the card 28px from the edge.
  padding: `1.5rem ${space[4]} max(1.75rem, env(safe-area-inset-bottom))`,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space[3],
  maxHeight: "100dvh",
  overflowY: "auto",
  overscrollBehavior: "contain",
});
export const root = style([
  keyboardFocus,
  {
    ...typography.body,
    fontSize: "0.875rem",
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space[4],
    padding: "0.8125rem 1.125rem",
    borderRadius: "0.75rem",
    backgroundColor: colorVars.toast.surface,
    color: colorVars.toast.text,
    boxShadow: "0 8px 20px oklch(0.24 0.014 84 / 0.2)",
    boxSizing: "border-box",
    width: "max-content",
    maxWidth: "min(32rem, 100%)",
    flexShrink: 0,
    pointerEvents: "auto",
    overflowWrap: "anywhere",
    animation: `${arrive} 240ms cubic-bezier(0.16, 1, 0.3, 1) both`,
    selectors: { "&:focus-visible": { outlineOffset: "-4px" } },
    "@media": {
      "(prefers-reduced-motion: reduce)": { animation: "none" },
      "(forced-colors: active)": {
        backgroundColor: "Canvas",
        color: "CanvasText",
        border: "1px solid CanvasText",
        boxShadow: "none",
      },
    },
  },
]);
export const content = style({ flex: "1 1 8rem", minWidth: 0 });
export const title = style({ minWidth: 0, margin: 0 });
export const description = style({ marginTop: space[1], minWidth: 0 });
export const action = style([
  keyboardFocus,
  {
    ...typography.mono,
    fontSize: "0.75rem",
    color: colorVars.toast.action,
    padding: 0,
    border: 0,
    background: "none",
    minHeight: "1.5rem",
    minWidth: "1.5rem",
    cursor: "pointer",
    textDecorationLine: "underline",
    textDecorationStyle: "dashed",
    textUnderlineOffset: "0.3em",
    textDecorationThickness: "1px",
    overflowWrap: "anywhere",
    maxWidth: "100%",
    selectors: {
      "&:hover": { textDecorationStyle: "solid" },
      "&:active": { textDecorationThickness: "2px" },
      "&:disabled": { opacity: 0.5, cursor: "not-allowed" },
    },
    "@media": {
      "(pointer: coarse)": { minHeight: "2.75rem", minWidth: "2.75rem" },
      "(forced-colors: active)": { color: "LinkText" },
    },
  },
]);
export const close = style([
  keyboardFocus,
  {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: "0 0 auto",
    border: 0,
    background: "none",
    color: "inherit",
    padding: space[1],
    width: "1.75rem",
    height: "1.75rem",
    cursor: "pointer",
    borderRadius: space[1],
    "@media": { "(pointer: coarse)": { width: "2.75rem", height: "2.75rem" } },
  },
]);
