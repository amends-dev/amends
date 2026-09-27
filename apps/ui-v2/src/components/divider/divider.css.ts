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

// The running stitch: 1.4px, 7px dashes with 6px gaps and round caps. Drawn as SVG because
// dashed CSS borders cannot set dash length or caps.
export const stitch = style({ flex: 1, minWidth: "1rem", height: "2px", overflow: "visible" });

export const label = style({
  ...typeScale.meta,
  flex: "none",
  color: vars.color.text.muted,
  fontWeight: fontWeight.medium,
  textTransform: "uppercase",
  "@media": { [media.touch]: { color: vars.color.text.secondary } },
});
