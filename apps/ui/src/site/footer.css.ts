import { style } from "@vanilla-extract/css";
import { media } from "../foundations/layout/tokens.ts";
import { vars } from "../foundations/theme/vars.css.ts";
import { fontWeight, typeScale } from "../foundations/typography/tokens.ts";
import { stitchLine } from "./stitch.css.ts";
import { displayFamily, siteType } from "./tokens.ts";

export const footer = style({
  backgroundColor: vars.color.surface.canvas,
  vars: { "--amends-logo-knockout": vars.color.surface.canvas },
});

export const seam = style([stitchLine, { display: "block" }]);

export const body = style({
  display: "grid",
  gap: "2.5rem",
  paddingBlock: "3.5rem 3rem",
  "@media": {
    [media.desktop]: { gridTemplateColumns: "1fr auto", columnGap: "4rem" },
  },
});

export const brand = style({ display: "grid", gap: "0.75rem", alignContent: "start" });

export const mark = style({ display: "inline-flex", alignItems: "center", gap: "0.625rem" });

export const wordmark = style({ fontFamily: displayFamily, ...siteType.wordmark });

export const tagline = style({ ...typeScale.body, margin: 0, color: vars.color.text.secondary });

export const columns = style({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(8rem, 1fr))",
  gap: "2rem 3rem",
  "@media": { [media.tablet]: { gridTemplateColumns: "repeat(3, minmax(9rem, auto))" } },
});

export const column = style({ display: "grid", gap: "0.75rem", alignContent: "start" });

export const columnTitle = style({
  ...typeScale.control,
  margin: 0,
  fontWeight: fontWeight.semibold,
  color: vars.color.text.primary,
});

export const list = style({
  display: "grid",
  gap: "0.5rem",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const link = style({
  ...typeScale.item,
  color: vars.color.text.secondary,
  textDecoration: "none",
  selectors: {
    "&:hover": { color: vars.color.text.primary },
    "&:focus-visible": { outline: `2px solid ${vars.color.text.primary}`, outlineOffset: "3px" },
  },
});

export const legal = style({
  ...typeScale.control,
  margin: 0,
  paddingBlockEnd: "2.5rem",
  color: vars.color.text.muted,
});
