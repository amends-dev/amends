import { style } from "@vanilla-extract/css";
import { space } from "../../foundations/spacing/tokens.ts";

export const root = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space[2],
  minWidth: 0,
  overflowWrap: "anywhere",
});
export const description = style({ selectors: { "&&": { fontSize: "0.6875rem" } } });
