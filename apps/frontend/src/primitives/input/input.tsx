import { splitProps, type JSX } from "solid-js";
import * as s from "./input.css.ts";

export type InputType = "text" | "email" | "password" | "search" | "tel" | "url";
export type InputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  type?: InputType;
};

/** Native text entry. The caller owns labels, descriptions, values, and validation timing. */
export function Input(props: InputProps): JSX.Element {
  const [local, native] = splitProps(props, ["type", "class", "classList"]);
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
  return <input {...native} type={local.type ?? "text"} class={classes()} />;
}
