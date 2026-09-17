import { createUniqueId, For, Show, type JSX } from "solid-js";
import * as s from "./radio-list.css.ts";
export interface RadioListOption {
  value: string;
  label: string;
  description?: string;
  metadata?: JSX.Element;
  disabled?: boolean;
}
export function RadioList(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly RadioListOption[];
  name?: string;
  metadataPlacement?: "responsive" | "inline";
}) {
  const id = createUniqueId();
  return (
    <fieldset class={s.root}>
      <legend class={s.legend}>{props.label}</legend>
      <For each={props.options}>
        {(option) => (
          <label class={s.row} data-metadata={props.metadataPlacement}>
            <input
              class={s.input}
              type="radio"
              name={props.name ?? id}
              value={option.value}
              checked={props.value === option.value}
              disabled={option.disabled}
              onChange={(e) => {
                if (e.currentTarget.checked) props.onChange(option.value);
              }}
            />
            <span class={s.dot} aria-hidden="true" />
            <span class={s.copy}>
              <span class={s.title}>{option.label}</span>
              <Show when={option.description}>
                <span class={s.description}>{option.description}</span>
              </Show>
            </span>
            <Show when={option.metadata}>
              <span class={s.metadata}>{option.metadata}</span>
            </Show>
          </label>
        )}
      </For>
    </fieldset>
  );
}
