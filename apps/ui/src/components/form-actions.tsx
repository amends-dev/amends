import { Text } from "./text.tsx";
import { Show, type JSX } from "solid-js";
import * as s from "./form-actions.css.ts";

export interface FormActionsProps {
  primary: JSX.Element;
  secondary?: JSX.Element;
  description?: JSX.Element;
}

/** One commit point after the editable content, with the secondary action before the primary. */
export function FormActions(props: FormActionsProps) {
  return (
    <div class={s.root}>
      <Show when={props.description}>
        <Text as="p" variant="bodySmall" class={s.description}>
          {props.description}
        </Text>
      </Show>
      <div class={s.actions}>
        {props.secondary}
        {props.primary}
      </div>
    </div>
  );
}
