import type { JSX } from "solid-js";
import * as s from "./step-list.css.ts";
export function StepList(props: { label: string; children: JSX.Element }) {
  return (
    <ol class={s.list} aria-label={props.label}>
      {props.children}
    </ol>
  );
}
export interface StepItemProps {
  number: number;
  title: string;
  description: string;
  action?: JSX.Element;
  current?: boolean;
  complete?: boolean;
}
export function StepItem(props: StepItemProps) {
  return (
    <li class={s.item} aria-current={props.current ? "step" : undefined}>
      <span
        class={s.number}
        data-current={props.current || undefined}
        aria-label={props.complete ? "Completed" : undefined}
      >
        {props.complete ? "✓" : props.number}
      </span>
      <div class={s.copy}>
        <span class={s.title}>{props.title}</span>
        <span class={s.description}>{props.description}</span>
      </div>
      {props.action}
    </li>
  );
}
