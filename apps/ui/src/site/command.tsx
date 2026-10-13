import { splitProps, type JSX } from "solid-js"
import { classes } from "../internal/props.ts"
import * as s from "./command.css.ts"

export type CommandProps = Omit<JSX.HTMLAttributes<HTMLPreElement>, "children"> & {
  /** Without the prompt, such as "bun add @amends-dev/harness". */
  command: string
}

/** A command to run, after a prompt; clicking it selects all of it. */
export function Command(props: CommandProps) {
  const [local, native] = splitProps(props, ["command", "class"])
  return (
    <pre {...native} class={classes(s.command, local.class)}>
      <span class={s.prompt} aria-hidden="true">
        $
      </span>
      <code class={s.text}>{local.command}</code>
    </pre>
  )
}
