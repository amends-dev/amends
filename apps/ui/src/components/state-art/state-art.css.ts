import { keyframes, style } from "@vanilla-extract/css"
import { vars } from "../../foundations/theme/vars.css.ts"

// The mark's square, patch, and stitches in the current text color, cut out in the color of the
// surface behind, which a parent can set.
const knockout = `var(--amends-art-knockout, ${vars.color.surface.canvas})`
const still = "(prefers-reduced-motion: reduce)"

export const art = style({ display: "block", flex: "none", overflow: "visible", height: "4.5rem" })

export const ink = style({ fill: "currentColor" })
export const inkLine = style({ fill: "none", stroke: "currentColor", strokeWidth: 2.4 })
export const knock = style({ fill: knockout })
export const knockLine = style({
  fill: "none",
  stroke: knockout,
  strokeWidth: 2.4,
  strokeLinecap: "square"
})
export const patch = style({ fill: "currentColor", stroke: knockout, strokeWidth: 2.6 })

// An outline waiting to be filled.
export const ghost = style({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
  strokeDasharray: "6 5",
  strokeLinecap: "round",
  opacity: 0.38
})

const box = { transformBox: "fill-box", transformOrigin: "center" } as const
const loop = (
  name: string,
  seconds: number,
  easing = "ease-in-out",
  delay = 0
): { readonly animation: string; readonly "@media": Record<string, object> } => ({
  animation: `${name} ${seconds}s ${easing} ${delay}s infinite both`,
  "@media": { [still]: { animation: "none" } }
})
const spring = "cubic-bezier(.3,1.4,.5,1)"
const strain = "cubic-bezier(.3,1.5,.5,1)"

const sewIn = keyframes({
  "0%, 6%": { opacity: 0, transform: "translateY(-12px) rotate(8deg)" },
  "22%": { opacity: 1, transform: "none" },
  "27%": { transform: "translateY(1.5px)" },
  "32%, 78%": { transform: "none", opacity: 1 },
  "92%, 100%": { opacity: 0, transform: "translateY(-12px) rotate(8deg)" }
})
const reach = keyframes({
  "0%, 100%": { strokeDashoffset: 46 },
  "45%, 55%": { strokeDashoffset: 22 }
})
const fill = keyframes({
  "0%, 100%": { opacity: 0, transform: "scale(.9)" },
  "45%, 55%": { opacity: 0.55, transform: "scale(1)" }
})
const blink = keyframes({
  "0%, 100%": { opacity: 0.2 },
  "20%": { opacity: 1 },
  "45%": { opacity: 0.2 }
})
const breathe = keyframes({
  "0%, 100%": { transform: "scale(1)" },
  "50%": { transform: "scale(1.04)" }
})
const swing = keyframes({
  "0%, 100%": { transform: "rotate(-15deg)" },
  "50%": { transform: "rotate(-4deg)" }
})
const fray = keyframes({
  "0%, 100%": { transform: "rotate(-9deg)" },
  "50%": { transform: "rotate(7deg)" }
})
const recoilStart = keyframes({
  "0%, 60%, 100%": { transform: "translateX(0)" },
  "12%": { transform: "translateX(-3.5px)" },
  "30%": { transform: "translateX(1px)" }
})
const recoilEnd = keyframes({
  "0%, 60%, 100%": { transform: "translateX(0)" },
  "12%": { transform: "translateX(3.5px)" },
  "30%": { transform: "translateX(-1px)" }
})
const scan = keyframes({
  "0%": { transform: "translateX(-10px)", opacity: 0 },
  "18%, 82%": { opacity: 1 },
  "50%": { transform: "translateX(10px)" },
  "100%": { transform: "translateX(-10px)", opacity: 0 }
})
const pull = keyframes({
  "0%, 55%, 100%": { transform: "translate(0, 0)" },
  "22%": { transform: "translate(4.5px, 4.5px)" },
  "34%": { transform: "translate(3px, 3px)" }
})
const taut = keyframes({
  "0%, 55%, 100%": { transform: "scaleX(1)" },
  "22%": { transform: "scaleX(1.55)" }
})

export const sewingIn = style({ ...box, ...loop(sewIn, 3.2, spring) })
export const reaching = style({
  strokeLinecap: "square",
  strokeDasharray: 46,
  ...loop(reach, 2.8)
})
export const guide = style({ strokeDasharray: "5 5", opacity: 0.16 })
export const filling = style({ ...box, ...loop(fill, 2.8) })
export const seam = style({ strokeDasharray: "6 6", opacity: 0.28 })
export const caret = style({
  strokeWidth: 2.6,
  strokeLinecap: "square",
  ...loop(blink, 1.5, "linear")
})
export const breathing = style({ ...box, ...loop(breathe, 3.6) })
// Still, the loose patch and frayed stitches rest partway, so the break still reads.
export const swinging = style({
  transformBox: "fill-box",
  transformOrigin: "0 0",
  ...loop(swing, 2.6),
  "@media": { [still]: { animation: "none", transform: "rotate(-10deg)" } }
})
const frayed = { transformBox: "fill-box", transformOrigin: "0 50%" } as const
export const fraying = style({
  ...frayed,
  ...loop(fray, 2.6),
  "@media": { [still]: { animation: "none", transform: "rotate(-9deg)" } }
})
export const frayingLate = style({
  ...frayed,
  ...loop(fray, 2.6, "ease-in-out", 0.15),
  "@media": { [still]: { animation: "none", transform: "rotate(7deg)" } }
})
export const recoilingStart = style({ ...box, strokeLinecap: "square", ...loop(recoilStart, 2.2) })
export const recoilingEnd = style({ ...box, strokeLinecap: "square", ...loop(recoilEnd, 2.2) })
export const scanning = style({ ...box, strokeLinecap: "square", ...loop(scan, 2.6, "linear") })
export const pulling = style({ ...box, ...loop(pull, 2.4, strain) })
export const tautening = style({ ...box, ...loop(taut, 2.4, strain) })
