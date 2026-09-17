import { type } from "../styles/type.css.ts";
import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  background: vars.color.surface.muted,
  borderRadius: 12,
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
});
export const header = style([
  type.caption,
  {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
    color: vars.color.text.secondary,
  },
]);
export const metadata = style({
  marginLeft: "auto",
  color: vars.color.text.muted,
});
export const actions = style({ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 2 });
