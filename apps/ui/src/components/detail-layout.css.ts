import { style } from "@vanilla-extract/css";
import { breakpoint } from "../tokens/index.ts";

export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: 16,
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  padding: "8px 30px 24px",
  overflowY: "auto",
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { padding: "6px 18px 22px" } },
});
export const header = style({ flexShrink: 0, minWidth: 0 });
export const body = style({ flex: 1, minHeight: 0, minWidth: 0 });
