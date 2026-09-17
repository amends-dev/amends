import { For } from "solid-js";
import * as s from "./change-list.css.ts";
export interface ChangeListEntry {
  kind: "added" | "removed" | "changed" | "moved";
  text: string;
}
export function ChangeList(props: { items: readonly ChangeListEntry[]; label?: string }) {
  return (
    <ul class={s.list} aria-label={props.label ?? "Changes"}>
      <For each={props.items}>
        {(item) => (
          <li class={s.item} data-kind={item.kind}>
            <span class={s.mark} aria-label={item.kind}>
              {item.kind === "added" ? "+" : item.kind === "removed" ? "−" : "~"}
            </span>
            <span>{item.text}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
