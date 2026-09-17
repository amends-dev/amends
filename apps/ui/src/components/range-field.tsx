import { Field } from "./field.tsx";
import { createUniqueId } from "solid-js";
import * as s from "./range-field.css.ts";
export function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  description?: string;
}) {
  const id = createUniqueId();
  return (
    <Field id={id} label={props.label} description={props.description}>
      <div class={s.row}>
        <input
          id={id}
          class={s.input}
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          aria-valuetext={props.valueText}
          aria-describedby={props.description ? `${id}-description` : undefined}
          onInput={(event) => props.onChange(event.currentTarget.valueAsNumber)}
        />
        <output for={id} class={s.value}>
          {props.valueText}
        </output>
      </div>
    </Field>
  );
}
