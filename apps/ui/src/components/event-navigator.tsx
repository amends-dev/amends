import { For } from "solid-js";
import { StatusIndicator, type StatusTone } from "./status-indicator.tsx";
export type EventDirection = "in" | "here" | "out";
import * as s from "./event-navigator.css.ts";
export function EventNavigator(props: {
  items: readonly { id: string; direction: EventDirection; label: string; tone: StatusTone }[];
  current?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav class={s.root} aria-label="Conversation events">
      <For each={props.items}>
        {(item) => (
          <button
            class={s.item}
            type="button"
            aria-label={item.label}
            aria-controls={item.id}
            aria-current={props.current === item.id ? "step" : undefined}
            onClick={() => props.onSelect(item.id)}
          >
            <StatusIndicator decorative tone={item.tone} />
            {item.direction}
          </button>
        )}
      </For>
    </nav>
  );
}
