import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";

export const skeleton = style({
  display: "block",
  width: "100%",
  maxWidth: "100%",
  height: "0.75rem",
  flexShrink: 1,
  boxSizing: "border-box",
  borderRadius: "0.25rem",
  backgroundColor: colorVars.surface.skeleton,
  selectors: { "&[hidden]": { display: "none" } },
  "@media": { "(forced-colors: active)": { backgroundColor: "GrayText" } },
});
