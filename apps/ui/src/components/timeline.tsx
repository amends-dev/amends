import type { JSX } from "solid-js";
import * as s from "./timeline.css.ts";
export function Timeline(props: { label: string; children: JSX.Element }) {
  return (
    <ol class={s.root} aria-label={props.label}>
      {props.children}
    </ol>
  );
}
export function TimelineItem(props: { children: JSX.Element }) {
  return <li class={s.item}>{props.children}</li>;
}
export function TimelineEvent(props: {
  indicator?: JSX.Element;
  children: JSX.Element;
  time: string;
}) {
  return (
    <div class={s.event}>
      {props.indicator}
      <span>{props.children}</span>
      <span class={s.seam} aria-hidden="true" />
      <time>{props.time}</time>
    </div>
  );
}
