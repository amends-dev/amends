import { Show, type JSX } from "solid-js";
import * as s from "./content-toolbar.css.ts";

export interface ContentToolbarProps {
  filters?: JSX.Element;
  view?: JSX.Element;
}

/** Filters stay at the start and view switches at the end, including when they wrap onto two rows. */
export function ContentToolbar(props: ContentToolbarProps) {
  return (
    <div class={s.root}>
      <Show when={props.filters}>
        <div class={s.filters}>{props.filters}</div>
      </Show>
      <Show when={props.view}>
        <div class={s.view}>{props.view}</div>
      </Show>
    </div>
  );
}
