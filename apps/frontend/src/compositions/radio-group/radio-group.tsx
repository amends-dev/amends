import { For, Show, createMemo, createUniqueId, splitProps, type JSX } from "solid-js";
import { Radio } from "../../primitives/radio/index.ts";
import { Text } from "../../primitives/text/index.ts";
import { FormError } from "../form-error.tsx";
import * as feedback from "../form-feedback.css.ts";
import * as s from "./radio-group.css.ts";

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}
export type RadioGroupProps = Omit<JSX.FieldsetHTMLAttributes<HTMLFieldSetElement>, "children"> & {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  options: readonly RadioOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  variant?: "plain" | "card";
};

const describedBy = (...parts: (string | undefined)[]) =>
  [...new Set(parts.filter(Boolean).join(" ").split(/\s+/).filter(Boolean))].join(" ") || undefined;

/** Native single-choice group. Values, validation timing, and reset belong to the caller. */
export function RadioGroup(props: RadioGroupProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "label",
    "description",
    "error",
    "required",
    "options",
    "value",
    "onValueChange",
    "variant",
    "id",
    "name",
    "form",
    "aria-describedby",
    "aria-invalid",
    "class",
    "classList",
  ]);
  const generated = createUniqueId();
  const id = () => local.id ?? generated;
  const name = () => local.name ?? generated;
  const invalid = () => (local.error ? true : local["aria-invalid"]);
  const descriptions = () =>
    describedBy(
      local["aria-describedby"],
      local.description ? `${id()}-description` : undefined,
      local.error ? `${id()}-error` : undefined,
    );
  // Key by value so refreshed option objects keep their controls and keyboard focus.
  const options = createMemo(() => {
    const indexed = new Map<string, RadioOption>();
    for (const option of local.options) {
      if (indexed.has(option.value)) throw new Error("RadioGroup option values must be unique");
      indexed.set(option.value, option);
    }
    return indexed;
  });
  const classes = () =>
    [
      s.root,
      local.class,
      ...Object.entries(local.classList ?? {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
    ]
      .filter(Boolean)
      .join(" ");
  return (
    <fieldset
      {...native}
      id={id()}
      name={name()}
      form={local.form}
      aria-describedby={descriptions()}
      aria-invalid={invalid()}
      class={classes()}
    >
      <legend class={`${feedback.label} ${s.legend}`}>
        {local.label}
        <Show when={local.required}>
          <span aria-hidden="true"> (required)</span>
        </Show>
      </legend>
      <div class={s.stack}>
        <div class={s.options}>
          <For each={[...options().keys()]}>
            {(value) => {
              const option = () => options().get(value)!;
              const optionId = createUniqueId();
              return (
                <label class={`${s.choice} ${s.variants[local.variant ?? "plain"]}`} for={optionId}>
                  <Radio
                    id={optionId}
                    name={name()}
                    form={local.form}
                    value={value}
                    checked={local.value === value}
                    disabled={option().disabled}
                    required={local.required}
                    aria-labelledby={`${optionId}-label`}
                    aria-describedby={describedBy(
                      descriptions(),
                      option().description ? `${optionId}-description` : undefined,
                    )}
                    aria-invalid={invalid()}
                    onChange={(event) => {
                      if (event.currentTarget.checked) local.onValueChange(value);
                    }}
                  />
                  <span class={s.copy}>
                    <Text as="span" id={`${optionId}-label`} class={s.optionLabel}>
                      {option().label}
                    </Text>
                    <Show when={option().description}>
                      <Text as="span" id={`${optionId}-description`} class={s.description}>
                        {option().description}
                      </Text>
                    </Show>
                  </span>
                </label>
              );
            }}
          </For>
        </div>
        <Show when={local.description}>
          <Text id={`${id()}-description`} tone="secondary" class={s.description}>
            {local.description}
          </Text>
        </Show>
        <Show when={local.error}>
          <FormError id={`${id()}-error`}>{local.error}</FormError>
        </Show>
      </div>
    </fieldset>
  );
}
