import { style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";

// The knockout matches the surface behind the mark; a parent can override the variable.
const knockout = `var(--amends-logo-knockout, ${vars.color.surface.canvas})`;
const spring = "transform 0.35s cubic-bezier(.3,1.7,.5,1)";

export const mark = style({ display: "block", flex: "none", overflow: "visible" });

export const base = style({ fill: "currentColor" });

// Hovering the link or button that holds the mark lifts the patch at its corner.
export const patch = style({
  fill: "currentColor",
  stroke: knockout,
  strokeWidth: 2.6,
  transformBox: "fill-box",
  transformOrigin: "0 0",
  transition: spring,
  selectors: {
    "a:hover &, button:hover &": { transform: "rotate(7deg) translate(1.5px, 1.5px)" },
  },
  "@media": { "(prefers-reduced-motion: reduce)": { transition: "none" } },
});

export const stitch = style({
  stroke: knockout,
  strokeWidth: 2.4,
  strokeLinecap: "square",
  transformBox: "fill-box",
  transformOrigin: "center",
  transition: spring,
  selectors: { "a:hover &, button:hover &": { transform: "scale(1.35)" } },
  "@media": { "(prefers-reduced-motion: reduce)": { transition: "none" } },
});
