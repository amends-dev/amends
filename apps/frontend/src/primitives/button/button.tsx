import { splitProps, type JSX } from "solid-js";
import * as s from "./button.css.ts";

export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>;

/** A primary native button. Activation, disabled behavior, and form semantics belong to HTML. */
export function Button(props: ButtonProps): JSX.Element {
  const [local, native] = splitProps(props, ["type", "class", "classList", "children"]);
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
  return (
    <button {...native} type={local.type ?? "button"} class={classes()}>
      {local.children}
    </button>
  );
}
