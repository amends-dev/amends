import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const list = style({
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
  padding: 0,
  width: "100%",
  maxWidth: 460,
  textAlign: "left",
});
export const item = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  padding: "14px 4px",
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
});
export const number = style({
  width: 22,
  height: 22,
  borderRadius: "50%",
  border: `1px dashed ${vars.color.line.control}`,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  selectors: {
    '&[data-current="true"]': {
      background: vars.color.action.fill,
      color: vars.color.action.onFill,
      borderColor: vars.color.action.fill,
    },
  },
});
export const copy = style({
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flex: 1,
  minWidth: 160,
});
export const title = style({ fontFamily: vars.font.sans, fontSize: "0.90625rem" });
export const description = style({
  fontFamily: vars.font.sans,
  fontSize: "0.78125rem",
  lineHeight: 1.5,
  color: vars.color.text.muted,
});
