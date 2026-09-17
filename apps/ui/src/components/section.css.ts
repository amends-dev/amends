import { type } from "../styles/type.css.ts";
import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
import { breakpoint } from "../tokens/index.ts";
export const root = style({ display: "flex", flexDirection: "column", gap: 11, minWidth: 0 });
export const stack = style({ display: "flex", flexDirection: "column", gap: 26 });
export const header = style([
  type.caption,
  {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px 12px",
    color: vars.color.text.muted,
  },
]);
export const title = style({
  margin: 0,
  textTransform: "uppercase",
});
export const seam = style({
  flex: 1,
  minWidth: 24,
  borderTop: `1px dashed ${vars.color.line.subtle}`,
});
export const note = style({
  "@media": { [`(max-width: ${breakpoint.navigation - 1}px)`]: { flexBasis: "100%" } },
});
