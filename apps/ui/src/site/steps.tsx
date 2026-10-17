import { splitProps, type JSX } from "solid-js"
import { classes } from "../internal/props.ts"
import * as s from "./steps.css.ts"

/** Numbered steps, one `Step` each. */
export function Root(props: JSX.HTMLAttributes<HTMLOListElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <ol {...native} class={classes(s.steps, local.class)} />
}

export type StepProps = Omit<JSX.HTMLAttributes<HTMLLIElement>, "title"> & { title: string }

/** A step's title and what it involves, numbered by its place. */
export function Step(props: StepProps) {
  const [local, native] = splitProps(props, ["title", "class", "children"])
  return (
    <li {...native} class={classes(s.step, local.class)}>
      <h3 class={s.title}>{local.title}</h3>
      <p class={s.text}>{local.children}</p>
    </li>
  )
}
