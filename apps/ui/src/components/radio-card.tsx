import { createUniqueId, For, type JSX } from "solid-js";
import * as s from "./choices.css.ts";
export interface RadioCardOption {
  value: string;
  label: string;
  preview?: JSX.Element;
  metadata?: JSX.Element;
  description?: string;
  disabled?: boolean;
}
export interface RadioCardGroupProps {
  label: string;
  compact?: boolean;
  stacked?: boolean;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly RadioCardOption[];
}
/** Native, mutually exclusive choices with arrow-key navigation and form submission. */
export function RadioCardGroup(props: RadioCardGroupProps) {
  const id = createUniqueId();
  return (
    <fieldset class={s.group}>
      <legend class={s.legend}>{props.label}</legend>
      <div class={s.options} data-stacked={props.stacked}>
        <For each={props.options}>
          {(option) => (
            <label class={s.card} data-compact={props.compact || undefined}>
              <input
                class={s.radio}
                type="radio"
                name={props.name ?? id}
                value={option.value}
                checked={props.value === option.value}
                disabled={option.disabled}
                onChange={(event) => {
                  if (event.currentTarget.checked) props.onChange(option.value);
                }}
              />
              {option.preview && <span aria-hidden="true">{option.preview}</span>}
              <span class={s.cardHeading}>
                <span>{option.label}</span>
                {option.metadata}
              </span>
              {option.description && <span class={s.description}>{option.description}</span>}
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}
