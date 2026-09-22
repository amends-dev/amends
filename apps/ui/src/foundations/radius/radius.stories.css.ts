import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { space } from "@amends/ui/foundations/spacing";

// Workshop layout and decorative shapes; these do not define control dimensions.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[6],
});
export const group = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[3],
});
export const shapes = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: space[6],
});
export const figure = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[2],
  margin: space[0],
  maxWidth: "100%",
  flexShrink: 0,
});
export const shape = style({ width: "100%", backgroundColor: colorVars.text.primary });
export const caption = style({ whiteSpace: "nowrap" });
