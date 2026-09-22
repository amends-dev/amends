import { splitProps, type JSX } from "solid-js";
import * as s from "./switch.css.ts";
export type SwitchProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "children" | "role" | "aria-checked"
> & { "aria-checked"?: never };
/** Native binary checkbox with switch semantics; no mixed state. */
export function Switch(props: SwitchProps): JSX.Element {
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
  return <input type="checkbox" role="switch" {...native} class={classes()} />;
}
