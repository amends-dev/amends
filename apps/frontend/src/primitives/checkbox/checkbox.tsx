import { createEffect, splitProps, type JSX } from "solid-js";
import * as s from "./checkbox.css.ts";
export type CheckboxProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Native mixed state; user activation clears it. Checked still determines submission. */
  indeterminate?: boolean;
};
export function Checkbox(props: CheckboxProps): JSX.Element {
  const [local, native] = splitProps(props, ["indeterminate", "ref", "class", "classList"]);
  let input!: HTMLInputElement;
  createEffect(() => {
    input.indeterminate = local.indeterminate ?? false;
  });
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
    <input
      type="checkbox"
      {...native}
      class={classes()}
      ref={(element) => {
        input = element;
        if (typeof local.ref === "function") local.ref(element);
      }}
    />
  );
}
