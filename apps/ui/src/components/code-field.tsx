import { createUniqueId, Index, Show } from "solid-js";
import { Text } from "./text.tsx";
import * as s from "./code-field.css.ts";

export interface CodeFieldProps {
  label: string;
  /** Digits entered so far; the caller keeps it to at most `length` digits. */
  value: string;
  onInput: (digits: string) => void;
  length?: number;
  description?: string | undefined;
  error?: string | undefined;
  disabled?: boolean | undefined;
}

/**
 * A one-time numeric code. One real input carries focus, keyboard entry,
 * paste, and autofill; the boxes are presentation. Digits only reach the
 * caller; the caller decides when the code is complete.
 */
export function CodeField(props: CodeFieldProps) {
  const id = createUniqueId();
  const length = () => props.length ?? 6;
  const describedBy = () =>
    [props.description && `${id}-description`, props.error && `${id}-error`]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div class={s.field}>
      <Text as="label" variant="titleSmall" for={id}>
        {props.label}
      </Text>
      <div class={s.boxes}>
        <Index each={Array.from({ length: length() })}>
          {(_, index) => (
            <span
              class={s.box}
              aria-hidden="true"
              data-filled={index < props.value.length}
              data-caret={index === props.value.length}
              data-invalid={Boolean(props.error)}
            >
              {props.value[index] ?? ""}
            </span>
          )}
        </Index>
        <input
          id={id}
          class={s.input}
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]*"
          maxlength={length()}
          value={props.value}
          disabled={props.disabled}
          aria-invalid={props.error ? "true" : undefined}
          aria-describedby={describedBy()}
          onInput={(event) =>
            props.onInput(event.currentTarget.value.replace(/\D/g, "").slice(0, length()))
          }
        />
      </div>
      <Show when={props.description}>
        <Text as="p" variant="bodySmall" id={`${id}-description`} class={s.description}>
          {props.description}
        </Text>
      </Show>
      <Show when={props.error}>
        <Text as="p" variant="bodySmall" id={`${id}-error`} class={s.error}>
          {props.error}
        </Text>
      </Show>
    </div>
  );
}
