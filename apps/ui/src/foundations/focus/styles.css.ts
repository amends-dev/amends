import { style } from "@vanilla-extract/css";
import { colorVars } from "../color/theme.css.ts";
import { focus } from "./tokens.ts";

/** Apply to a focusable element inside a color theme. The browser owns focus visibility. */
export const focusVisible = style({
  selectors: {
    "&:focus-visible": {
      outline: `${focus.width} solid ${colorVars.focus.ring}`,
      outlineOffset: focus.offset,
    },
  },
});
