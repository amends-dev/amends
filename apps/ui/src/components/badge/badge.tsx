import { splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import * as s from "./badge.css.ts"

export type BadgeProps = JSX.HTMLAttributes<HTMLSpanElement>

/** A short label for a property, such as "Public". */
export function Badge(props: BadgeProps) {
  const [local, native] = splitProps(props, ["class"])
  return <span {...native} class={classes(s.badge, local.class)} />
}
