import { createSignal } from "solid-js";
import * as s from "./number-stepper.css.ts";
export interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}
/** Integer input with bounded increments. Empty or invalid text is restored on blur. */
export function NumberStepper(props: NumberStepperProps) {
  const [editing, setEditing] = createSignal<string>();
  const bounded = (value: number) =>
    Math.min(props.max ?? Number.MAX_SAFE_INTEGER, Math.max(props.min ?? 0, value));
  const change = (value: number) => {
    if (!props.disabled) {
      props.onChange(bounded(value));
      setEditing(undefined);
    }
  };
  return (
    <div class={s.root} role="group" aria-label={props.label}>
      <button
        type="button"
        class={s.button}
        aria-label={`Decrease ${props.label}`}
        disabled={props.disabled || props.value <= (props.min ?? 0)}
        onClick={() => change(props.value - 1)}
      >
        −
      </button>
      <input
        class={s.input}
        type="number"
        aria-label={props.label}
        min={props.min ?? 0}
        max={props.max}
        step={1}
        disabled={props.disabled}
        value={editing() ?? props.value}
        onInput={(event) => {
          const text = event.currentTarget.value;
          setEditing(text);
          if (text !== "" && Number.isSafeInteger(Number(text)))
            props.onChange(bounded(Number(text)));
        }}
        onBlur={() => setEditing(undefined)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setEditing(undefined);
          }
        }}
      />
      <button
        type="button"
        class={s.button}
        aria-label={`Increase ${props.label}`}
        disabled={props.disabled || props.value >= (props.max ?? Number.MAX_SAFE_INTEGER)}
        onClick={() => change(props.value + 1)}
      >
        +
      </button>
    </div>
  );
}
