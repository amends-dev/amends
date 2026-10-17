import { For, splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import * as s from "./logo.css.ts"

// Drawn on a 64-unit grid: a square, a patch over its corner, and four stitches across the seam.
const stitches = ["M18.5 37 H25.5", "M18.5 30 H25.5", "M30 18.5 V25.5", "M37 18.5 V25.5"]

/**
 * The mark in motion, looping: `sew-on` drops the patch on and pops the stitches in, for a launch;
 * `thread` draws each stitch through in turn, quiet enough to idle; `tug` wobbles the patch from
 * its corner, for something done; `working` lights the stitches while the patch breathes, a loader.
 */
export type LogoMotion = "sew-on" | "thread" | "tug" | "working"

const motions = {
  "sew-on": s.sewOn,
  thread: s.thread,
  tug: s.tug,
  working: s.working
} as const satisfies Record<LogoMotion, string>

export type LogoProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "children" | "viewBox"> & {
  /** CSS length. Default 1.25rem. */
  size?: string
  /** Omit when a visible name or the surrounding control already names it. */
  label?: string
  /** Loops one of the mark's motions; still when the reader prefers reduced motion. */
  motion?: LogoMotion
}

/** The Amends mark, in the current text color. Its patch lifts when its link or button is hovered. */
export function Logo(props: LogoProps) {
  const [local, native] = splitProps(props, ["size", "label", "motion", "class"])
  return (
    <svg
      {...native}
      class={classes(s.mark, local.motion && motions[local.motion], local.class)}
      viewBox="0 0 64 64"
      width={local.size ?? "1.25rem"}
      height={local.size ?? "1.25rem"}
      role={local.label ? "img" : undefined}
      aria-label={local.label}
      aria-hidden={local.label ? undefined : true}
    >
      <rect class={s.base} x="3" y="3" width="42" height="42" />
      <rect class={s.patch} x="22" y="22" width="39" height="39" />
      <For each={stitches}>{(d, index) => <path class={classes(s.stitch, s.stitchAt[index()])} d={d} />}</For>
    </svg>
  )
}
