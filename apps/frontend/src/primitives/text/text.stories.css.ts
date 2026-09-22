import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { typographyStyles } from "../../foundations/typography/styles.css.ts";

// Layout and native controls belong to the workshop fixture.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
});
export const scope = style({ padding: 24, minWidth: 0 });
export const stack = style({ display: "grid", gap: 24 });
export const group = style({ display: "grid", gap: 12 });
export const secondary = style({ color: colorVars.text.secondary });
export const panel = style({ backgroundColor: colorVars.surface.panel, padding: 20 });
export const narrow = style({ maxWidth: 320, boxSizing: "border-box", overflowWrap: "anywhere" });
export const controls = style([
  typographyStyles.body,
  { display: "flex", flexWrap: "wrap", gap: 16 },
]);
export const label = style({ display: "grid", gap: 4 });
