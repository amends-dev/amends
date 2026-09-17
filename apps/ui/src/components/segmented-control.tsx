import { createUniqueId, For, type JSX } from "solid-js";
import * as s from "./segmented-control.css.ts";

export interface SegmentedControlOption {
  value: string;
  label: string;
  /** Short text or an icon with a count, displayed on mobile. The full label remains accessible. */
  compactLabel?: JSX.Element;
  disabled?: boolean;
}
export interface SegmentedControlProps {
  label: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SegmentedControlOption[];
  disabled?: boolean;
}

/** A controlled single choice. Native radios provide keyboard navigation and form values. */
export function SegmentedControl(props: SegmentedControlProps) {
  const id = createUniqueId();
  return (
    <fieldset class={s.group} aria-label={props.label} disabled={props.disabled}>
      <div class={s.options}>
        <For each={props.options}>
          {(option) => (
            <label class={s.option}>
              <input
                class={s.input}
                type="radio"
                name={props.name ?? id}
                value={option.value}
                aria-label={option.label}
                checked={props.value === option.value}
                disabled={option.disabled}
                onChange={(event) => {
                  if (event.currentTarget.checked) props.onChange(option.value);
                }}
              />
              <span
                aria-hidden="true"
                class={option.compactLabel !== undefined ? s.fullLabel : undefined}
              >
                {option.label}
              </span>
              {option.compactLabel !== undefined && (
                <span aria-hidden="true" class={s.compactLabel}>
                  {option.compactLabel}
                </span>
              )}
            </label>
          )}
        </For>
      </div>
    </fieldset>
  );
}
