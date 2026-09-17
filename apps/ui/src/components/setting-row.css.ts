import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  alignItems: "center",
  gap: 20,
  paddingBlock: 14,
  borderBlock: `1px dashed ${vars.color.line.subtle}`,
});
export const copy = style({ flex: 1, minWidth: 0 });
export const description = style({
  margin: "4px 0 0",
  color: vars.color.text.muted,
});
export const control = style({ flexShrink: 0 });
