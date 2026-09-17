import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const row = style({ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 });
export const input = style({
  flex: 1,
  minWidth: 140,
  minHeight: 44,
  accentColor: vars.color.text.primary,
});
export const value = style({ fontFamily: vars.font.mono, fontSize: 12 });
