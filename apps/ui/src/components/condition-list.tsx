import { For } from "solid-js";
import * as s from "./condition-list.css.ts";
export interface Condition {
  name: string;
  passed: boolean;
  expected: string;
  observed: string;
}
export function ConditionList(props: { items: readonly Condition[] }) {
  return (
    <ul class={s.list}>
      <For each={props.items}>
        {(item) => (
          <li class={s.row}>
            <span aria-label={item.passed ? "Passed" : "Failed"}>{item.passed ? "✓" : "✕"}</span>
            <span>{item.name}</span>
            <div>
              <div>expects {item.expected}</div>
              <div class={s.observed}>{item.observed}</div>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}
