import { For, createUniqueId, type JSX } from "solid-js";
import { IconCheck } from "@amends/icons";
import { Radio } from "../../primitives/radio/index.ts";
import { Text } from "../../primitives/text/index.ts";
import * as s from "./theme-choice.css.ts";

export type ThemePreference = "light" | "dark" | "system";
export interface ThemeChoiceProps {
  value: ThemePreference;
  onValueChange: (value: ThemePreference) => void;
  disabled?: boolean;
}
const options = [
  { value: "light", label: "Cotton" },
  { value: "dark", label: "Soot" },
  { value: "system", label: "System" },
] as const;

/** Controlled presentation. The application resolves system appearance and saves the preference. */
export function ThemeChoice(props: ThemeChoiceProps): JSX.Element {
  const id = createUniqueId();
  return (
    <fieldset class={s.root} disabled={props.disabled} aria-describedby={`${id}-hint`}>
      <legend class={s.legend}>Theme</legend>
      <div class={s.options}>
        <For each={options}>
          {(option) => (
            <label class={s.option}>
              <Radio
                class={s.input}
                name={id}
                value={option.value}
                checked={props.value === option.value}
                onChange={(event) => {
                  if (event.currentTarget.checked) props.onValueChange(option.value);
                }}
              />
              <span aria-hidden="true" class={`${s.preview} ${s.previews[option.value]}`}>
                <span class={s.seam} />
              </span>
              <span class={s.label}>
                {option.label}
                <IconCheck class={s.check} />
              </span>
            </label>
          )}
        </For>
      </div>
      <Text id={`${id}-hint`} tone="secondary" class={s.hint}>
        {props.value === "system"
          ? "Follows your operating system."
          : `Always use ${props.value === "light" ? "Cotton" : "Soot"}.`}
      </Text>
    </fieldset>
  );
}
