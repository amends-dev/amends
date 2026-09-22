import { splitProps, type JSX } from "solid-js";
import * as s from "./radio.css.ts";

export type RadioProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "children">;

/** A visible native radio. The caller owns labeling, grouping by name, and selection state. */
export function Radio(props: RadioProps): JSX.Element {
  const [local, native] = splitProps(props, ["class", "classList"]);
  const classes = () =>
    [
      s.root,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    ]
      .filter(Boolean)
      .join(" ");
  return <input type="radio" {...native} class={classes()} />;
}
