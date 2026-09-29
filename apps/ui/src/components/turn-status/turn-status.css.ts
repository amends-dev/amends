import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

// A quiet tile, like a badge, with the state's mark before its name.
export const chip = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3125rem",
  flex: "none",
  boxSizing: "border-box",
  minHeight: "1.375rem",
  paddingInline: "0.5rem",
  backgroundColor: vars.color.surface.subtle,
  color: vars.color.text.secondary,
  fontWeight: fontWeight.medium,
  whiteSpace: "nowrap",
});

// A failure reads in the caution color, outlined rather than filled so its text keeps contrast.
export const tone = styleVariants({
  quiet: {},
  caution: {
    backgroundColor: "transparent",
    boxShadow: `inset 0 0 0 1px ${vars.color.status.caution.border}`,
    color: vars.color.status.caution.text,
  },
});

// The mark alone, beside text such as "Yumi working" in a thread's replies.
export const mark = style({
  ...typeScale.hint,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3125rem",
  minWidth: 0,
  color: vars.color.text.secondary,
  whiteSpace: "nowrap",
});

export const icon = style({ flex: "none", width: "0.875rem", height: "0.875rem" });
