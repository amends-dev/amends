import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// A quiet label for a property such as visibility.
export const badge = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "1.375rem",
  paddingInline: "0.5625rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  whiteSpace: "nowrap",
});
