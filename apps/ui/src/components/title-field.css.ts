import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  width: "100%",
  fontFamily: vars.font.serif,
  fontSize: "inherit",
  lineHeight: 1.2,
  padding: "4px 0 8px",
  border: "none",
  borderBottom: `1px dashed ${vars.color.line.control}`,
  borderRadius: 0,
  background: "none",
});
