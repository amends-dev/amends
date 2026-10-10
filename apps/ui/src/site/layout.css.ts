import { style } from "@vanilla-extract/css";
import { media } from "../foundations/layout/tokens.ts";
import { siteLayout } from "./tokens.ts";

/** The column every section lines its content up to, with a gutter that widens past phones. */
export const container = style({
  boxSizing: "border-box",
  width: "100%",
  maxWidth: `calc(${siteLayout.width} + 2 * ${siteLayout.gutterWide})`,
  marginInline: "auto",
  paddingInline: siteLayout.gutter,
  "@media": { [media.tablet]: { paddingInline: siteLayout.gutterWide } },
});
