import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { space } from "@amends/ui/foundations/spacing";

// Shared workshop framing; not part of either form's production presentation.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 30rem), 1fr))",
});
export const frame = style({
  minWidth: 0,
  padding: space[6],
  backgroundColor: colorVars.surface.canvas,
  color: colorVars.text.primary,
});
export const sample = style({
  minWidth: 0,
  maxWidth: "26.25rem",
  paddingBlock: space[4],
});
export const panel = style({ backgroundColor: colorVars.surface.panel, padding: space[4] });
export const controls = style({ marginBlockStart: space[6] });
