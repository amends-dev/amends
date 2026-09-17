import { Text } from "./text.tsx";
import { createContext, createUniqueId, Show, splitProps, useContext, type JSX } from "solid-js";
import * as s from "./field.css.ts";

type FieldState = {
  id: string;
  required: boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
};
const FieldContext = createContext<FieldState>();
export type FieldProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "id"> & {
  /** Id of the control, not the wrapper. Generated if omitted. One control per Field. */
  id?: string;
  label: JSX.Element;
  description?: string | undefined;
  error?: string | undefined;
  required?: boolean;
  disabled?: boolean;
};
/** Owns the control's identity and associations. Validation timing and focus belong to the form. */
export function Field(props: FieldProps) {
  const [local, rest] = splitProps(props, [
    "id",
    "label",
    "description",
    "error",
    "required",
    "disabled",
    "children",
    "class",
  ]);
  const generated = createUniqueId();
  const state: FieldState = {
    get id() {
      return local.id ?? generated;
    },
    get required() {
      return local.required ?? false;
    },
    get disabled() {
      return local.disabled ?? false;
    },
    get invalid() {
      return Boolean(local.error);
    },
    get describedBy() {
      return (
        [local.description && `${state.id}-description`, local.error && `${state.id}-error`]
          .filter(Boolean)
          .join(" ") || undefined
      );
    },
  };
  return (
    <FieldContext.Provider value={state}>
      <div {...rest} class={`${s.field} ${local.class ?? ""}`}>
        <Text as="label" variant="titleSmall" for={state.id}>
          {local.label}
          <Show when={local.required}>
            <Text as="span" variant="inherit" aria-hidden="true">
              {" "}
              (required)
            </Text>
          </Show>
        </Text>
        {local.children}
        <Show when={local.description}>
          <Text as="p" variant="bodySmall" id={`${state.id}-description`} class={s.description}>
            {local.description}
          </Text>
        </Show>
        <Show when={local.error}>
          <Text as="p" variant="bodySmall" id={`${state.id}-error`} class={s.error}>
            {local.error}
          </Text>
        </Show>
      </div>
    </FieldContext.Provider>
  );
}

type AssociationProps = Pick<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "id" | "required" | "disabled" | "aria-invalid" | "aria-describedby"
>;
/** Field owns id and can impose required, disabled, and invalid; caller descriptions are retained. */
export function useFieldControl(props: AssociationProps) {
  const field = useContext(FieldContext);
  const generated = createUniqueId();
  return {
    get id() {
      return field?.id ?? props.id ?? generated;
    },
    get required() {
      return field?.required || props.required;
    },
    get disabled() {
      return field?.disabled || props.disabled;
    },
    get "aria-invalid"() {
      return field?.invalid || props["aria-invalid"];
    },
    get "aria-describedby"() {
      return [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
    },
  };
}
