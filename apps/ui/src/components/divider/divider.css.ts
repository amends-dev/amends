import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { fontWeight, typeScale } from "../../foundations/typography/tokens.ts";

export const divider = style({
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  minHeight: "1.25rem",
  margin: 0,
  color: vars.color.border.stitch,
});

// The running stitch, as internal/stitch.ts draws it.
export const stitch = style({ flex: 1, minWidth: "1rem", height: "2px", overflow: "visible" });

export const label = style({
  ...typeScale.meta,
  flex: "none",
  color: vars.color.text.muted,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  selectors: {
    "&[data-style=text]": {
      ...typeScale.control,
      lineHeight: "1.125rem",
      fontWeight: fontWeight.regular,
      textTransform: "none",
      color: vars.color.text.secondary,
    },
  },
  "@media": { [media.touch]: { color: vars.color.text.secondary } },
});
