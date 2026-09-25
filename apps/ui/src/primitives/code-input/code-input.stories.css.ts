import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { space } from "@amends/ui/foundations/spacing";

export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
});
export const frame = style({
  padding: space[6],
  minWidth: 0,
  backgroundColor: colorVars.surface.canvas,
  color: colorVars.text.primary,
  overflowWrap: "anywhere",
});
export const panel = style({ padding: space[4], backgroundColor: colorVars.surface.panel });
export const fieldset = style({ border: 0, padding: 0, margin: 0, minWidth: 0 });
