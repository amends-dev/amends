import { For, splitProps, type JSX } from "solid-js";
import { classes } from "../../internal/props.ts";
import * as s from "./logo.css.ts";

// Drawn on a 64-unit grid: a square, a patch over its corner, and four stitches across the seam.
const stitches = ["M18.5 37 H25.5", "M18.5 30 H25.5", "M30 18.5 V25.5", "M37 18.5 V25.5"];

export type LogoProps = Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "children" | "viewBox"> & {
  /** CSS length. Default 1.25rem. */
  size?: string;
  /** Omit when a visible name or the surrounding control already names it. */
  label?: string;
};

/** The Amends mark, in the current text color. Its patch lifts when its link or button is hovered. */
export function Logo(props: LogoProps) {
  const [local, native] = splitProps(props, ["size", "label", "class"]);
  return (
    <svg
      {...native}
      class={classes(s.mark, local.class)}
      viewBox="0 0 64 64"
      width={local.size ?? "1.25rem"}
      height={local.size ?? "1.25rem"}
      role={local.label ? "img" : undefined}
      aria-label={local.label}
      aria-hidden={local.label ? undefined : true}
    >
      <rect class={s.base} x="3" y="3" width="42" height="42" />
      <rect class={s.patch} x="22" y="22" width="39" height="39" />
      <For each={stitches}>{(d) => <path class={s.stitch} d={d} />}</For>
    </svg>
  );
}
