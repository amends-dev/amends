import { Show, createContext, createUniqueId, splitProps, useContext, type JSX } from "solid-js";
import { classes } from "../../internal/props.ts";
import * as s from "./field.css.ts";

interface FieldIds {
  readonly control: string;
  readonly hint: string;
  readonly error: string;
  readonly hasHint: () => boolean;
  readonly hasError: () => boolean;
}
const Context = createContext<FieldIds>();

/** The ids a control inside a Field uses for its label and descriptions. */
export function useField() {
  const field = useContext(Context);
  if (!field) return undefined;
  return {
    id: field.control,
    describedBy: () =>
      [field.hasHint() && field.hint, field.hasError() && field.error].filter(Boolean).join(" ") ||
      undefined,
    invalid: field.hasError,
  };
}

export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Help shown under the control. */
  hint?: string;
  /** Replaces nothing: shown under the hint and marks the control invalid. */
  error?: string;
};

/** A label, one control, and its help and error text. Controls inside pick up the associations. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["hint", "error", "class", "children"]);
  const id = createUniqueId();
  const ids: FieldIds = {
    control: `field-${id}`,
    hint: `field-${id}-hint`,
    error: `field-${id}-error`,
    hasHint: () => Boolean(local.hint),
    hasError: () => Boolean(local.error),
  };
  return (
    <Context.Provider value={ids}>
      <div {...native} class={classes(s.field, local.class)}>
        {local.children}
        <Show when={local.hint}>
          <p id={ids.hint} class={s.hint}>
            {local.hint}
          </p>
        </Show>
        <Show when={local.error}>
          <p id={ids.error} class={s.error}>
            {local.error}
          </p>
        </Show>
      </div>
    </Context.Provider>
  );
}

export type LabelProps = JSX.LabelHTMLAttributes<HTMLLabelElement>;

export function Label(props: LabelProps) {
  const field = useContext(Context);
  const [local, native] = splitProps(props, ["class"]);
  return <label {...native} for={field?.control} class={classes(s.label, local.class)} />;
}
