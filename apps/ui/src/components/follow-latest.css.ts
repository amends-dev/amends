import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexDirection: "column",
  height: "min(65rem, calc(100dvh - 260px))",
  minHeight: 320,
  minWidth: 0,
});
export const viewport = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overflowAnchor: "none",
  overscrollBehavior: "contain",
  padding: 4,
  ":focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: -2 },
});
