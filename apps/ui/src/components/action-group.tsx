import { Text } from "./text.tsx";
import { children, Show, type JSX } from "solid-js";
import * as s from "./action-group.css.ts";
export function ActionGroup(props: { children: JSX.Element; description?: JSX.Element }) {
  const descriptionSlot = children(() => props.description);
  return (
    <div class={s.root}>
      {props.children}
      <Show when={descriptionSlot()}>
        <Text as="p" variant="bodySmall" class={s.description}>
          {descriptionSlot()}
        </Text>
      </Show>
    </div>
  );
}
