import { style } from "@vanilla-extract/css";
import { colorVars } from "@amends/frontend/foundations/color/styles";

// Specimen layout, not spacing or layout foundations.
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
});
export const narrow = style({ maxWidth: 320 });
export const specimen = style({ minWidth: 0, padding: 24, overflowWrap: "anywhere" });
export const title = style({ margin: "0 0 12px" });
export const description = style({ margin: "0 0 32px" });
export const role = style({ margin: "0 0 32px" });
export const roleName = style({ margin: "0 0 8px" });
export const details = style({ margin: "0 0 20px", color: colorVars.text.secondary });
export const sample = style({ margin: "0 0 16px" });
export const secondary = style({ color: colorVars.text.secondary });
