import { For, type JSX } from "solid-js";
import * as s from "./description-list.css.ts";
export function DescriptionList(props: {
  items: readonly { label: string; value: JSX.Element }[];
}) {
  return (
    <dl class={s.root}>
      <For each={props.items}>
        {(item) => (
          <div class={s.row}>
            <dt class={s.label}>{item.label}</dt>
            <dd class={s.value}>{item.value}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
