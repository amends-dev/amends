import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { space } from "../../foundations/spacing/tokens.ts";

export const page = style({ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" });
export const frame = style({ paddingBlock: space[6], overflowWrap: "anywhere", minWidth: 0 });
export const cell = style({
  minWidth: 0,
  boxSizing: "border-box",
  padding: space[3],
  backgroundColor: colorVars.surface.panel,
  border: `1px dashed ${colorVars.line.control}`,
  overflowWrap: "anywhere",
});
export const boundary = style({ backgroundColor: colorVars.action.hover, minWidth: 0 });
export const preview = style({
  maxWidth: "100%",
  minWidth: 0,
  paddingBlock: space[4],
  backgroundColor: colorVars.surface.panel,
});
export const list = style({ listStyle: "none", margin: 0, padding: 0 });
export const range = style({
  maxWidth: "100%",
  width: "18rem",
  accentColor: colorVars.action.fill,
});
