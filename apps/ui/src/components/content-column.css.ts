import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const root = style({
  minHeight: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: `${vars.space[6]} ${vars.space[4]} ${vars.space[8]}`,
});
export const column = style({
  width: "100%",
  maxWidth: 420,
  flexShrink: 0,
  display: "grid",
  gap: vars.space[6],
  selectors: {
    '&[data-width="wide"]': { maxWidth: 560 },
    '&[data-align="center"]': { marginBlock: "auto" },
  },
});
