import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  gap: 4,
  marginTop: 18,
});
export const heading = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 12px",
  marginBottom: 7,
  minHeight: 16,
});
export const label = style({
  margin: 0,
  fontFamily: vars.font.mono,
  fontSize: "0.625rem",
  fontWeight: 400,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: vars.color.text.muted,
  selectors: {
    [`${root}[data-compact="true"] &`]: {
      position: "absolute",
      width: 1,
      height: 1,
      overflow: "hidden",
      clipPath: "inset(50%)",
    },
  },
});
export const seam = style({ flex: 1, borderTop: `1px dashed ${vars.color.line.subtle}` });
