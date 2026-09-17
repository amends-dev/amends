import type { JSX } from "solid-js";
import * as s from "./activity-row.css.ts";
export interface ActivityRowProps {
  indicator: JSX.Element;
  time: string;
  dateTime?: string;
  event: string;
  subject: JSX.Element;
  actor: JSX.Element;
}
export function ActivityList(props: { label: string; children: JSX.Element }) {
  return (
    <ol aria-label={props.label} class={s.list}>
      {props.children}
    </ol>
  );
}
export function ActivityRow(props: ActivityRowProps) {
  return (
    <li class={s.row}>
      <span class={s.indicator}>{props.indicator}</span>
      <time class={s.time} dateTime={props.dateTime}>
        {props.time}
      </time>
      <span class={s.event}>{props.event}</span>
      <span class={s.subject}>{props.subject}</span>
      <span class={s.actor}>{props.actor}</span>
    </li>
  );
}
