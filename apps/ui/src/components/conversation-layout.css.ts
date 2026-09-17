import { style } from "@vanilla-extract/css";
import { breakpoint } from "../tokens/index.ts";
export const root = style({
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
});
export const body = style({
  selectors: { '&[data-empty="true"]': { display: "grid", alignContent: "center" } },
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "8px 30px",
  overscrollBehavior: "contain",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { paddingInline: 18 } },
});
export const footer = style({
  flexShrink: 0,
  padding: "12px 30px 18px",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { padding: "12px 18px" } },
});
export const header = style({
  display: "flex",
  justifyContent: "flex-end",
  flexShrink: 0,
  padding: "12px 30px",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { paddingInline: 18 } },
});
