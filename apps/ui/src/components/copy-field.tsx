import { createSignal, createEffect, on } from "solid-js";
import { Field } from "./field.tsx";
import { TextField } from "./text-field.tsx";
import { Button } from "./button.tsx";
import { ActionGroup } from "./action-group.tsx";
export function CopyField(props: { label: string; value: string }) {
  const [message, setMessage] = createSignal("");
  createEffect(
    on(
      () => props.value,
      () => setMessage(""),
    ),
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.value);
      setMessage("Copied.");
    } catch {
      setMessage("Could not copy. Select the text and copy it manually.");
    }
  };
  return (
    <>
      <Field label={props.label}>
        <TextField value={props.value} readOnly />
      </Field>
      <ActionGroup>
        <Button
          variant="secondary"
          onClick={() => {
            void copy();
          }}
        >
          copy
        </Button>
        <span role="status">{message()}</span>
      </ActionGroup>
    </>
  );
}
