import { style } from "@vanilla-extract/css";
import { space } from "@amends/ui/foundations/spacing";
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
});
export const frame = style({ minWidth: 0, padding: space[6], overflowWrap: "anywhere" });
export const stack = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[4],
});
export const surface = style({ minWidth: 0, padding: space[4] });
export const label = style({
  display: "flex",
  gap: space[3],
  alignItems: "center",
  minHeight: "2.75rem",
  cursor: "pointer",
  selectors: { "&:has(input:disabled)": { cursor: "not-allowed" } },
});
export const fieldset = style({ padding: 0, margin: 0, minWidth: 0, border: 0 });
export const row = style({ display: "flex", flexWrap: "wrap", gap: space[3] });
