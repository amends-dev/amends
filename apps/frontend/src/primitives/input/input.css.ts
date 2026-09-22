import { style } from "@vanilla-extract/css";
import { fieldControl } from "../control/field-control.css.ts";
import { colorVars } from "../../foundations/color/theme.css.ts";
export const root = style([
  fieldControl,
  {
    selectors: {
      "&::placeholder": { color: colorVars.text.secondary, opacity: 1 },
      "&:disabled::placeholder": { color: colorVars.text.disabled },
    },
  },
]);
