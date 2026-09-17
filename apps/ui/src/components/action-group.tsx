import { Text } from "./text.tsx";
import { Show, type JSX } from "solid-js";
import * as s from "./action-group.css.ts";
export function ActionGroup(props: { children: JSX.Element; description?: JSX.Element }) {
  return (
    <div class={s.root}>
      {props.children}
      <Show when={props.description}>
        <Text as="p" variant="bodySmall" class={s.description}>
          {props.description}
        </Text>
      </Show>
    </div>
  );
}
