import { For, Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { IconComponent } from "../../internal/props.ts";
import * as s from "./empty-state.css.ts";

export interface EmptyStateProps {
  readonly icon?: IconComponent;
  readonly title: string;
  /** Short sentences under the title. */
  readonly lines?: readonly string[];
  /** 1 when it is the page's heading. Default 2. */
  readonly level?: 1 | 2;
  /** Actions under the text, such as a Button. */
  readonly children?: JSX.Element;
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
      <Dynamic component={`h${props.level ?? 2}`} class={s.title}>
        {props.title}
      </Dynamic>
      <For each={props.lines}>{(line) => <p class={s.line}>{line}</p>}</For>
      <Show when={props.children}>
        <div class={s.actions}>{props.children}</div>
      </Show>
    </div>
  );
}
