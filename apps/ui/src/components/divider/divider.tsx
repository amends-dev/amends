import { Show, splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import { stitch } from "../../internal/stitch.ts"
import * as s from "./divider.css.ts"

function Stitch() {
  return (
    <svg class={s.stitch} aria-hidden="true">
      <line
        x1="1"
        x2="100%"
        y1="1"
        y2="1"
        stroke="currentColor"
        stroke-width={stitch.width}
        stroke-dasharray={stitch.dashes}
        stroke-linecap="round"
      />
    </svg>
  )
}

export type DividerProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  /** Shown in capitals, such as "Today" or "4 replies". */
  label?: string
  /** Center the label between two stitches, or lead with it. Default center. */
  align?: "center" | "start"
  /** "caps" is a small uppercase label; "text" reads as a word, such as "or". Default caps. */
  labelStyle?: "caps" | "text"
}

/** A stitched line that separates content, optionally labelled. */
export function Divider(props: DividerProps) {
  const [local, native] = splitProps(props, ["label", "align", "labelStyle", "class"])
  return (
    <div {...native} role={local.label ? undefined : "separator"} class={classes(s.divider, local.class)}>
      <Show when={local.label && local.align !== "start"}>
        <Stitch />
      </Show>
      <Show when={local.label}>
        <span class={s.label} data-style={local.labelStyle ?? "caps"}>
          {local.label}
        </span>
      </Show>
      <Stitch />
    </div>
  )
}
