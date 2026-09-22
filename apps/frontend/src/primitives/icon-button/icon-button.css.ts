import { style } from "@vanilla-extract/css";
import { radius } from "../../foundations/radius/tokens.ts";
export const root = style({
  selectors: {
    "&&": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: "2.75rem",
      height: "2.75rem",
      minWidth: "2.75rem",
      minHeight: "2.75rem",
      padding: 0,
      borderRadius: radius.medium,
    },
    "&[hidden]": { display: "none" },
  },
});
export const glyph = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "1.25rem",
  height: "1.25rem",
  lineHeight: 1,
});
