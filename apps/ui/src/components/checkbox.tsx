import { createEffect, createUniqueId, Show, splitProps, type JSX } from "solid-js";
import * as s from "./field.css.ts";

export type CheckboxProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "children" | "class"
> & {
  label: JSX.Element;
  description?: string;
  /** Set by the caller for partial selection; the browser clears it when the user toggles. */
  indeterminate?: boolean;
  /** Styles the label/hit area. Native attributes and ref go to the input. */
  class?: string;
};
/** Native checkbox, including keyboard, required, disabled, submission, and reset behavior. */
export function Checkbox(props: CheckboxProps) {
  const [local, rest] = splitProps(props, [
    "id",
    "label",
    "description",
    "indeterminate",
    "class",
    "ref",
    "aria-describedby",
    "aria-labelledby",
  ]);
  const generated = createUniqueId();
  const id = () => local.id ?? generated;
  let input!: HTMLInputElement;
  createEffect(() => {
    input.indeterminate = local.indeterminate ?? false;
  });
  return (
    <label class={`${s.checkboxLabel} ${local.class ?? ""}`} for={id()}>
      <input
        type="checkbox"
        {...rest}
        id={id()}
        class={s.checkbox}
        ref={(element) => {
          input = element;
          if (typeof local.ref === "function") local.ref(element);
        }}
        aria-labelledby={local["aria-labelledby"] ?? `${id()}-label`}
        aria-describedby={
          [local.description && `${id()}-description`, local["aria-describedby"]]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <span class={s.checkboxText}>
        <span id={`${id()}-label`}>{local.label}</span>
        <Show when={local.description}>
          <span id={`${id()}-description`} class={s.description}>
            {local.description}
          </span>
        </Show>
      </span>
    </label>
  );
}
