import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { typeScale } from "../../foundations/typography/tokens.ts";

export const form = style({ display: "flex", flexDirection: "column", gap: "0.75rem" });

export const note = style({
  ...typeScale.hint,
  margin: 0,
  color: vars.color.text.secondary,
  selectors: { "&:empty": { display: "none" } },
});
