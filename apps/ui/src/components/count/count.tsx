import { splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import * as s from "./count.css.ts"

export type CountProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: number
  variant?: "badge" | "plain"
}

/** A number beside a label. Give it an `aria-label` when the number alone is unclear. */
export function Count(props: CountProps) {
  const [local, native] = splitProps(props, ["value", "variant", "class"])
  return (
    <span {...native} class={classes(s.count, s.variant[local.variant ?? "badge"], local.class)}>
      {local.value}
    </span>
  )
}
