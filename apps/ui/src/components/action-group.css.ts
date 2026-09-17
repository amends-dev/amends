import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 });
export const description = style({
  margin: 0,
  flex: "1 1 200px",
  color: vars.color.text.muted,
});
