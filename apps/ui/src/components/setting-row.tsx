import { Text } from "./text.tsx";
import { createUniqueId, type JSX } from "solid-js";
import * as s from "./setting-row.css.ts";
export function SettingRow(props: { label: string; description: string; children: JSX.Element }) {
  const id = createUniqueId();
  return (
    <div class={s.root} role="group" aria-labelledby={id} aria-describedby={`${id}-description`}>
      <div class={s.copy}>
        <Text as="span" variant="titleSmall" id={id}>
          {props.label}
        </Text>
        <Text as="p" variant="bodySmall" id={`${id}-description`} class={s.description}>
          {props.description}
        </Text>
      </div>
      <div class={s.control}>{props.children}</div>
    </div>
  );
}
