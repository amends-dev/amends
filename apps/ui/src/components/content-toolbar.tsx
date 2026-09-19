import { children, Show, type JSX } from "solid-js";
import * as s from "./content-toolbar.css.ts";

export interface ContentToolbarProps {
  filters?: JSX.Element;
  view?: JSX.Element;
}

/** Filters stay at the start and view switches at the end, including when they wrap onto two rows. */
export function ContentToolbar(props: ContentToolbarProps) {
  const filtersSlot = children(() => props.filters);
  const viewSlot = children(() => props.view);
  return (
    <div class={s.root}>
      <Show when={filtersSlot()}>
        <div class={s.filters}>{filtersSlot()}</div>
      </Show>
      <Show when={viewSlot()}>
        <div class={s.view}>{viewSlot()}</div>
      </Show>
    </div>
  );
}
