import { type JSX } from "solid-js";
import * as s from "./selection-bar.css.ts";
export interface SelectionBarProps {
  count: number;
  actions: JSX.Element;
}
/** Place in CollectionView's footer so actions cannot cover the scrolling rows. */
export function SelectionBar(props: SelectionBarProps) {
  return (
    <div class={s.bar} role="group" aria-label="Selection actions">
      <span role="status">
        {props.count} {props.count === 1 ? "task" : "tasks"} selected
      </span>
      <div class={s.actions}>{props.actions}</div>
    </div>
  );
}
