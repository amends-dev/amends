import { style } from "@vanilla-extract/css";
import { space } from "@amends/frontend/foundations/spacing";
import { typographyStyles } from "@amends/frontend/foundations/typography/styles";

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
export const row = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[3],
});
export const narrow = style({ maxWidth: "20rem", minWidth: 0 });
export const fieldset = style({ border: 0, padding: 0, margin: 0, minWidth: 0 });
export const legend = style([typographyStyles.body, { padding: 0, marginBottom: space[3] }]);
// Native inputs are workshop controls; this slice introduces only the Button primitive.
export const label = style([
  typographyStyles.body,
  { display: "flex", alignItems: "center", flexWrap: "wrap", gap: space[2] },
]);
export const input = style([
  typographyStyles.body,
  { minWidth: 0, maxWidth: "100%", boxSizing: "border-box" },
]);
