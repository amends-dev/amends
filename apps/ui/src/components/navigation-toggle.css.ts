import { style } from "@vanilla-extract/css";
import { vars } from "../styles/contract.css.ts";
export const button = style({
  alignSelf: "center",
  width: vars.control.touch,
  height: vars.control.touch,
  padding: 0,
  selectors: {
    '&[data-outlined="true"]': {
      width: `calc(${vars.control.touch} + 2px)`,
      height: `calc(${vars.control.touch} + 2px)`,
      borderColor: vars.color.line.seam,
    },
  },
});
export const glyph = style({ fontFamily: vars.font.mono, fontSize: 15, lineHeight: "normal" });
