import { style } from "@vanilla-extract/css";
import { colorVars } from "../../foundations/color/theme.css.ts";
import { fontFamilies } from "../../foundations/typography/tokens.ts";
import { radius } from "../../foundations/radius/tokens.ts";

export const root = style({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: "2.375rem",
  height: "2.375rem",
  boxSizing: "border-box",
  borderRadius: radius.medium,
  backgroundColor: colorVars.surface.panel,
  color: colorVars.text.primary,
  border: `1px dashed ${colorVars.line.control}`,
  fontFamily: fontFamilies.serif,
  fontSize: "1.1875rem",
  lineHeight: 1,
  overflow: "hidden",
  whiteSpace: "nowrap",
  selectors: {
    "&[hidden]": { display: "none" },
    '&[data-variant="brand"]': {
      width: "2.25rem",
      height: "2.25rem",
      borderRadius: "0.5rem",
      backgroundColor: colorVars.workspaceMark.surface,
      color: colorVars.workspaceMark.text,
      borderColor: "transparent",
    },
  },
  "@media": { "(forced-colors: active)": { borderColor: "CanvasText" } },
});
