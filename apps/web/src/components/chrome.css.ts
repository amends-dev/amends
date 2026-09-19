import { style } from "@vanilla-extract/css";
import { vars } from "@amends/ui/vars";
export const brand = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  color: "inherit",
  textDecoration: "none",
  border: "none",
});
export const identity = style({
  color: "inherit",
  textDecoration: "none",
  borderBottom: "none",
  display: "flex",
  alignItems: "center",
  gap: vars.space[2],
  minWidth: 0,
});
export const identityText = style({ display: "grid", minWidth: 0 });
export const identityLine = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const links = style({ display: "flex", gap: vars.space[4] });
