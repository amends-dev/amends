import { createUniqueId, type JSX } from "solid-js";
import * as s from "./disclosure.css.ts";
export function Disclosure(props: {
  label: string;
  compact?: boolean;
  divided?: boolean;
  status?: JSX.Element;
  indicator?: JSX.Element;
  metadata?: JSX.Element;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  children: JSX.Element;
}) {
  const id = createUniqueId();
  return (
    <div class={s.root} data-compact={props.compact} data-divided={props.divided !== false}>
      <button
        type="button"
        class={s.trigger}
        data-compact={props.compact}
        aria-expanded={props.expanded}
        aria-controls={id}
        onClick={() => props.onExpandedChange(!props.expanded)}
      >
        <span hidden={!props.compact} aria-hidden="true">
          {props.expanded ? "−" : "+"}
        </span>
        {props.indicator}
        <span>{props.label}</span>
        <span>{props.status}</span>
        <span hidden={props.compact} class={s.seam} aria-hidden="true" />
        <span>{props.metadata}</span>
        <span hidden={props.compact} aria-hidden="true">
          {props.expanded ? "−" : "+"}
        </span>
      </button>
      <div id={id} class={s.content} hidden={!props.expanded}>
        {props.children}
      </div>
    </div>
  );
}
