import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "../../foundations/theme/vars.css.ts";

// The knockout matches the surface behind the mark; a parent can override the variable.
const knockout = `var(--amends-logo-knockout, ${vars.color.surface.canvas})`;
const spring = "transform 0.35s cubic-bezier(.3,1.7,.5,1)";
const settle = "cubic-bezier(.3,1.4,.5,1)";
const still = "(prefers-reduced-motion: reduce)";

// The mark's motions, each built from its own parts.
export const sewOn = style({});
export const thread = style({});
export const tug = style({});
export const working = style({});

const drop = keyframes({
  "0%": { transform: "translate(18px, -18px) rotate(10deg)", opacity: 0 },
  "18%": { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
  "22%": { transform: "translate(0, 1.2px)" },
  "27%": { transform: "translate(0, 0)" },
  "86%": { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
  "96%, 100%": { transform: "translate(18px, -18px) rotate(10deg)", opacity: 0 },
});
const pop = keyframes({
  "0%, 30%": { transform: "scale(0)", opacity: 0 },
  "38%": { transform: "scale(1.4)", opacity: 1 },
  "44%": { transform: "scale(1)" },
  "86%": { transform: "scale(1)", opacity: 1 },
  "94%, 100%": { transform: "scale(0)", opacity: 0 },
});
const draw = keyframes({
  "0%": { strokeDashoffset: 7 },
  "18%, 78%": { strokeDashoffset: 0 },
  "96%, 100%": { strokeDashoffset: -7 },
});
const pull = keyframes({
  "0%, 40%, 100%": { transform: "rotate(0deg)" },
  "8%": { transform: "rotate(-6deg)" },
  "16%": { transform: "rotate(4deg)" },
  "24%": { transform: "rotate(-1.5deg)" },
  "32%": { transform: "rotate(0.5deg)" },
});
const twang = keyframes({
  "0%, 30%, 100%": { transform: "scale(1)" },
  "8%": { transform: "scale(1.35)" },
  "16%": { transform: "scale(0.9)" },
});
const nudge = keyframes({
  "0%, 100%": { transform: "translate(0, 0)" },
  "50%": { transform: "translate(2.5px, 2.5px)" },
});
const blink = keyframes({
  "0%, 100%": { opacity: 0.2 },
  "20%": { opacity: 1 },
  "45%": { opacity: 0.2 },
});
const loop = (name: string, seconds: number, easing: string, delay = 0) =>
  `${name} ${seconds}s ${easing} ${delay}s infinite both`;

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
    [`${sewOn} &`]: { transformOrigin: "center", animation: loop(drop, 3.2, settle) },
    [`${tug} &`]: { animation: loop(pull, 2.4, "ease-in-out") },
    [`${working} &`]: { animation: loop(nudge, 1.2, "ease-in-out") },
  },
  "@media": { [still]: { transition: "none", animation: "none" } },
});

export const stitch = style({
  stroke: knockout,
  strokeWidth: 2.4,
  strokeLinecap: "square",
  transformBox: "fill-box",
  transformOrigin: "center",
  transition: spring,
  selectors: {
    "a:hover &, button:hover &": { transform: "scale(1.35)" },
    [`${thread} &`]: { strokeLinecap: "butt", strokeDasharray: "7 20" },
    [`${tug} &`]: { animation: loop(twang, 2.4, "ease-out") },
  },
  "@media": { [still]: { transition: "none", animation: "none" } },
});

// Stitches follow one another: popping in, drawn through, or lighting up in turn.
export const stitchAt = [0, 1, 2, 3].map((index) =>
  style({
    selectors: {
      [`${sewOn} &`]: { animation: loop(pop, 3.2, settle, index * 0.12) },
      [`${thread} &`]: { animation: loop(draw, 3, "ease-in-out", index * 0.3) },
      [`${working} &`]: { animation: loop(blink, 1.2, "linear", index * 0.3) },
    },
    "@media": { [still]: { animation: "none" } },
  }),
);
