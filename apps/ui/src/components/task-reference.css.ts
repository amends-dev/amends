import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";

export const root = style({
  display: "grid",
  minWidth: 0,
  minHeight: 44,
  gap: 4,
  borderLeft: `2px solid ${vars.color.brand.fill}`,
  padding: "8px 12px",
  marginBlock: 10,
  color: vars.color.text.primary,
  textDecoration: "none",
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  selectors: {
    "&:focus-visible": { outline: `2px solid ${vars.color.focus.ring}`, outlineOffset: 2 },
    "&:hover": { background: vars.color.surface.muted },
  },
});
export const meta = style({ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 });
