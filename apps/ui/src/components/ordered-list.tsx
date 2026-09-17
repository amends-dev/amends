import { Show, type JSX } from "solid-js";
import * as s from "./ordered-list.css.ts";
export function OrderedList(props: { label: string; children: JSX.Element }) {
  return (
    <ol class={s.list} aria-label={props.label}>
      {props.children}
    </ol>
  );
}
export function OrderedListItem(props: {
  index: number;
  title: JSX.Element;
  description?: JSX.Element;
  actions?: JSX.Element;
  expanded?: boolean;
  disabled?: boolean;
  contentId?: string;
  children?: JSX.Element;
}) {
  return (
    <li class={s.item} data-expanded={props.expanded}>
      <div class={s.row}>
        <span class={s.index} aria-label={`Position ${props.index}`}>
          {props.index}
        </span>
        <div>
          <div class={s.title}>{props.title}</div>
          <Show when={props.description}>
            <div class={s.description}>{props.description}</div>
          </Show>
        </div>
        <Show when={props.actions}>
          <div class={s.actions}>{props.actions}</div>
        </Show>
      </div>
      <fieldset
        hidden={!props.expanded}
        disabled={props.disabled}
        id={props.contentId}
        class={s.editor}
      >
        <Show when={props.expanded}>{props.children}</Show>
      </fieldset>
    </li>
  );
}
