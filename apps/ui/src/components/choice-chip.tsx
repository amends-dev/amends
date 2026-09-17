import { createUniqueId, For, Show, type JSX } from "solid-js";
import { Identity, type IdentityData } from "./identity.tsx";
import * as s from "./choice-chip.css.ts";
export interface ChoiceChipOption {
  value: string;
  label: string;
  icon?: JSX.Element;
  identityKind?: IdentityData["kind"];
  disabled?: boolean;
}
export interface ChoiceChipGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly ChoiceChipOption[];
  appearance?: "soft" | "solid";
  name?: string;
  disabled?: boolean;
}
export function ChoiceChipGroup(props: ChoiceChipGroupProps) {
  const id = createUniqueId();
  return (
    <fieldset class={s.root} aria-label={props.label} disabled={props.disabled}>
      <For each={props.options}>
        {(option) => (
          <label class={s.chip} data-appearance={props.appearance}>
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
            <Show
              when={option.identityKind}
              fallback={
                <>
                  <span aria-hidden="true">{option.icon}</span>
                  {option.label}
                </>
              }
            >
              {(kind) => <Identity name={option.label} kind={kind()} size="compact" />}
            </Show>
          </label>
        )}
      </For>
    </fieldset>
  );
}
