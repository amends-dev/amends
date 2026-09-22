import { style } from "@vanilla-extract/css";
import { space } from "@amends/ui/foundations/spacing";
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
});
export const frame = style({ padding: space[6], minWidth: 0, overflowWrap: "anywhere" });
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[6],
});
export const surface = style({ padding: space[4], minWidth: 0 });
export const row = style({ display: "flex", flexWrap: "wrap", gap: space[3] });

export const nativeFieldset = style({ border: 0, padding: 0, margin: 0, minWidth: 0 });
