import { style } from "@vanilla-extract/css";
import { space } from "@amends/frontend/foundations/spacing";

export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
});
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[4],
});
export const frame = style({ minWidth: 0, padding: space[6], overflowWrap: "anywhere" });
export const surface = style({ minWidth: 0, padding: space[4] });
export const field = style({ display: "grid", minWidth: 0, gap: space[2] });
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[3],
});
export const fieldset = style({ border: 0, padding: 0, margin: 0, minWidth: 0 });
export const narrow = style({ maxWidth: "20rem", minWidth: 0 });
