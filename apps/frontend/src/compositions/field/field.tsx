import { Show, createUniqueId, splitProps, type JSX } from "solid-js";
import { Text } from "../../primitives/text/index.ts";
import * as s from "./field.css.ts";

export interface FieldControlProps {
  readonly id: string;
  readonly required: boolean;
  readonly disabled: boolean;
  readonly "aria-invalid": true | undefined;
  readonly "aria-labelledby": string;
  readonly "aria-describedby": string | undefined;
}
export type FieldProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Identity of the control; native id identifies the Field wrapper. */
  controlId?: string;
  /** Additional description IDs, merged with the visible help and error. */
  controlDescribedBy?: string;
  /** Render one labelable control, spreading these reactive associations last. */
  children: (control: FieldControlProps) => JSX.Element;
};

/** Presentation and associations for one control. The form owns values and validation timing. */
export function Field(props: FieldProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "label",
    "description",
    "error",
    "required",
    "disabled",
    "controlId",
    "controlDescribedBy",
    "children",
    "class",
    "classList",
  ]);
  const generated = createUniqueId();
  const control: FieldControlProps = {
    get id() {
      return local.controlId ?? generated;
    },
    get required() {
      return local.required ?? false;
    },
    get disabled() {
      return local.disabled ?? false;
    },
    get "aria-invalid"() {
      return local.error ? true : undefined;
    },
    get "aria-labelledby"() {
      return `${control.id}-label`;
    },
    get "aria-describedby"() {
      const ids = [
        local.controlDescribedBy,
        local.description ? `${control.id}-description` : undefined,
        local.error ? `${control.id}-error` : undefined,
      ]
        .filter(Boolean)
        .join(" ")
        .split(/\s+/)
        .filter(Boolean);
      return [...new Set(ids)].join(" ") || undefined;
    },
  };
  // Invoke once: changing help/error/identity must not recreate or blur the control.
  const content = local.children(control);
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
    <div {...native} class={classes()}>
      <label id={`${control.id}-label`} for={control.id} class={s.label}>
        {local.label}
        <Show when={local.required}>
          <span aria-hidden="true"> (required)</span>
        </Show>
      </label>
      {content}
      <Show when={local.description}>
        <Text
          id={`${control.id}-description`}
          variant="mono"
          tone="secondary"
          class={s.description}
        >
          {local.description}
        </Text>
      </Show>
      <Show when={local.error}>
        <Text id={`${control.id}-error`} tone="danger" class={s.error}>
          <span class={s.errorIndicator} aria-hidden="true" />
          <span class={s.errorMessage}>
            <span class={s.errorPrefix}>Error: </span>
            {local.error}
          </span>
        </Text>
      </Show>
    </div>
  );
}
