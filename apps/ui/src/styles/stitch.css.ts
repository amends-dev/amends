import { keyframes, style } from "@vanilla-extract/css";
import { stroke } from "../tokens/index.ts";
import { vars } from "./contract.css.ts";

const repeat = stroke.dash + stroke.gap;
const travel = keyframes({ to: { strokeDashoffset: -repeat * 2 } });
/** Decorative division only. Controls use line.control instead of line.seam. */
export const seam = style({
  height: stroke.hairline,
  backgroundImage: `repeating-linear-gradient(to right, ${vars.color.line.seam} 0 ${stroke.dash}px, transparent ${stroke.dash}px ${repeat}px)`,
});
/** Apply to an SVG path; keep an adjacent textual state when motion is disabled. */
export const runningStitch = style({
  fill: "none",
  stroke: vars.color.status.running,
  strokeWidth: stroke.base,
  strokeDasharray: `${stroke.dash} ${stroke.gap}`,
  animation: `${travel} ${vars.duration.stitch} ${vars.easing.linear} infinite`,
  "@media": { "(prefers-reduced-motion: reduce)": { animation: "none" } },
});
