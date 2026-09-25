import { style } from "@vanilla-extract/css";
import { space } from "../../foundations/spacing/tokens.ts";

export const root = style({ width: "100%", minWidth: 0, overflowWrap: "anywhere" });
export const submit = style({ width: "100%" });
// Shared by the two sign-in steps: mounted live regions without empty layout rows.
export const feedback = style({
  margin: 0,
  selectors: { "&:not(:empty)": { marginBlockStart: space[3] } },
});
