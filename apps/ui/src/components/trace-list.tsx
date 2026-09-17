import { createUniqueId, type JSX } from "solid-js";
import * as s from "./trace-list.css.ts";
export function TraceList(props: { label: string; children: JSX.Element }) {
  return (
    <ol aria-label={props.label} class={s.list}>
      {props.children}
    </ol>
  );
}
export function TraceItem(props: {
  index: string;
  title: string;
  result: string;
  matched?: boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  children: JSX.Element;
}) {
  const id = createUniqueId();
  return (
    <li class={s.item}>
      <button
        type="button"
        class={s.trigger}
        aria-expanded={props.expanded}
        aria-controls={id}
        onClick={() => props.onExpandedChange(!props.expanded)}
      >
        <span aria-hidden="true">{props.expanded ? "▾" : "›"}</span>
        <span class={s.dot} data-matched={props.matched} aria-hidden="true" />
        <span class={s.index}>{props.index}</span>
        <span class={s.title}>{props.title}</span>
        <span class={s.result}>{props.result}</span>
      </button>
      <div id={id} hidden={!props.expanded}>
        {props.children}
      </div>
    </li>
  );
}
