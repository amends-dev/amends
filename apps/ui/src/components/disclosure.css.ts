import { style, globalStyle } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";
export const root = style({
  selectors: {
    '&[data-divided="true"]': { borderBottom: `1px dashed ${vars.color.line.subtle}` },
  },
});
export const trigger = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 12px",
  padding: "14px 6px",
  border: 0,
  borderRadius: 8,
  background: "none",
  textAlign: "left",
  width: "100%",
  fontFamily: vars.font.mono,
  fontSize: "0.71875rem",
  color: vars.color.text.secondary,
  cursor: "pointer",
  selectors: {
    "&:hover": { background: vars.color.action.hover },
    "&:focus-visible": { outline: `${focus.width}px solid ${vars.color.focus.ring}` },
  },
});
export const seam = style({
  flex: 1,
  minWidth: 20,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
export const content = style({
  padding: "2px 0 18px 19px",
  fontFamily: vars.font.sans,
  fontSize: "0.90625rem",
  lineHeight: 1.6,
});

globalStyle(`${trigger}[data-compact="true"]`, {
  justifyContent: "flex-start",
  fontSize: "0.625rem",
  minHeight: 44,
  flexWrap: "wrap",
});

globalStyle(`${root}[data-compact="true"]`, { borderBottom: 0 });
