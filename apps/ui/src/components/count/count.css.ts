import { style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const count = style({
  ...typeScale.meta,
  display: "inline-grid",
  placeItems: "center",
  flex: "none",
  fontVariantNumeric: "tabular-nums",
});

export const variant = styleVariants({
  /** A 20px square badge, such as an unread count. */
  badge: {
    minWidth: "1.25rem",
    height: "1.25rem",
    paddingInline: "0.3125rem",
    boxSizing: "border-box",
    backgroundColor: vars.color.surface.subtle,
    color: vars.color.text.secondary,
    fontWeight: fontWeight.medium,
  },
  /** Muted text beside a label, such as a tab's item count. */
  plain: { color: vars.color.text.muted },
});
