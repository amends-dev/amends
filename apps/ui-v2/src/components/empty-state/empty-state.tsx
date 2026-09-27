import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { IconComponent } from "../../internal/props.ts";
import * as s from "./empty-state.css.ts";

export interface EmptyStateProps {
  readonly icon?: IconComponent;
  readonly title: string;
  /** Short sentences under the title. */
  readonly lines?: readonly string[];
}

/** A centered note where content will appear, such as a new group's welcome. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class={s.empty}>
      <Show when={props.icon}>
        {(icon) => (
          <span class={s.mark} aria-hidden="true">
            <Dynamic component={icon()} class={s.icon} />
          </span>
        )}
      </Show>
      <h2 class={s.title}>{props.title}</h2>
      <For each={props.lines}>{(line) => <p class={s.line}>{line}</p>}</For>
    </div>
  );
}
