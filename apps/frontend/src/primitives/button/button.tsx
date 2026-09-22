import { splitProps, type JSX } from "solid-js";
import * as s from "./button.css.ts";

export type ButtonVariant = "primary" | "secondary";
export type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/** A native button, primary by default. HTML owns activation, disabled behavior, and form semantics. */
export function Button(props: ButtonProps): JSX.Element {
  const [local, native] = splitProps(props, ["variant", "type", "class", "classList", "children"]);
  const classes = () =>
    [
      s.root,
      s.variants[local.variant ?? "primary"],
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
