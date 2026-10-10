import { style } from "@vanilla-extract/css";
import { vars } from "../foundations/theme/vars.css.ts";

// The running stitch as a CSS background, for lines whose length the layout decides: 7px dashes
// with 4px gaps, as the app's Divider draws them, one pixel thick.
const dashes = (direction: "to right" | "to bottom") =>
  `repeating-linear-gradient(${direction}, ${vars.color.border.stitch} 0 7px, transparent 7px 11px)`;

/** Backgrounds for a pseudo-element drawn as a stitch. */
export const stitchAcross = dashes("to right");
export const stitchDown = dashes("to bottom");

/** A horizontal stitch as wide as its box. */
export const stitchLine = style({ height: "1px", backgroundImage: stitchAcross });
