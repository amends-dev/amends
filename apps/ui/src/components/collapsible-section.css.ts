import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { focus } from "../tokens/index.ts";
export const heading = style({ margin: 0 });
export const trigger = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px 12px",
  minHeight: 44,
  padding: "6px 0 10px",
  border: "none",
  background: "none",
  textAlign: "left",
  width: "100%",
  fontFamily: vars.font.mono,
  fontWeight: 400,
  fontSize: "0.6875rem",
  lineHeight: 1.5,
  color: vars.color.text.muted,
  cursor: "pointer",
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width}px solid ${vars.color.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
export const title = style({
  textTransform: "uppercase",
  letterSpacing: "0.09em",
  color: vars.color.text.secondary,
});
export const symbol = style({ width: 9, flexShrink: 0, fontSize: "0.75rem" });
export const seam = style({
  flex: 1,
  minWidth: 24,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
