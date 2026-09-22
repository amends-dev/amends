import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/frontend/foundations/color/styles";
import { space } from "@amends/frontend/foundations/spacing";
import { radius } from "@amends/frontend/foundations/radius";

// Static color specimens. These dimensions do not define the future Button primitive.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 28rem), 1fr))",
});
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[4],
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const surface = style({ padding: space[4], minWidth: 0 });
export const states = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))",
  gap: space[5],
});
export const figure = style({ margin: space[0], minWidth: 0, alignContent: "start" });
export const sample = style({
  display: "block",
  boxSizing: "border-box",
  width: "100%",
  minWidth: 0,
  border: "none",
  borderRadius: radius.pill,
  padding: `${space[2]} ${space[4]}`,
  textAlign: "center",
  color: colorVars.action.onFill,
});
export const disabled = style({
  appearance: "none",
  opacity: 1,
  color: colorVars.text.disabled,
  backgroundColor: colorVars.action.disabled,
});
