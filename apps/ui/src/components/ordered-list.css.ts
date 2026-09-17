import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint } from "../tokens/index.ts";
export const list = style({ listStyle: "none", margin: 0, padding: 0 });
export const item = style({
  borderBottom: `1px dashed ${vars.color.line.subtle}`,
  padding: "16px 0",
  selectors: { '&[data-expanded="true"]': { background: vars.color.surface.muted } },
});
export const row = style({
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "center",
  "@media": {
    [`(max-width: ${breakpoint.navigation - 1}px)`]: { gridTemplateColumns: "20px minmax(0, 1fr)" },
  },
});
export const index = style({
  fontFamily: vars.font.mono,
  fontSize: 12,
  color: vars.color.text.muted,
});
export const title = style({ fontSize: 14, lineHeight: 1.6 });
export const description = style({
  fontFamily: vars.font.mono,
  fontSize: 11,
  lineHeight: 1.6,
  color: vars.color.text.muted,
  marginTop: 4,
});
export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { gridColumn: "1 / -1" } },
});
export const editor = style({
  border: 0,
  margin: 0,
  minWidth: 0,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
  marginTop: 16,
  padding: "20px 12px",
});
