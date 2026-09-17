import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint, focus } from "../tokens/index.ts";
const phone = `(max-width: ${breakpoint.navigation - 1}px)`;
export const root = style({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  minWidth: 0,
});
export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "8px 30px 30px",
  display: "flex",
  flexDirection: "column",
  gap: 26,
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: -2,
    },
  },
  "@media": { [phone]: { padding: "6px 18px 22px" } },
});
export const header = style({
  padding: "8px 30px 18px",
  "@media": { [phone]: { padding: "6px 18px 18px" } },
});
export const footer = style({
  flexShrink: 0,
  padding: "0 24px 18px",
  "@media": { [phone]: { padding: "0 12px 12px" } },
});
