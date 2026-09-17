import { createSignal, createUniqueId, Show, type JSX } from "solid-js";
import * as s from "./log-list.css.ts";
export function LogList(props: { children: JSX.Element; label?: string }) {
  return (
    <ol class={s.list} aria-label={props.label ?? "Session log"}>
      {props.children}
    </ol>
  );
}
export function LogRow(props: {
  time: string;
  indicator?: JSX.Element;
  children: JSX.Element;
  detail?: JSX.Element;
  narration?: boolean;
}) {
  return (
    <li class={s.row}>
      <span class={s.time}>{props.time}</span>
      <div class={s.content} data-narration={props.narration}>
        {props.indicator}
        <div>
          {props.children}
          <Show when={props.detail}>
            <div class={s.detail}>{props.detail}</div>
          </Show>
        </div>
      </div>
    </li>
  );
}
export function LogDisclosure(props: {
  time: string;
  title: string;
  target?: string | undefined;
  outcome?: string | undefined;
  duration?: string | undefined;
  failed?: boolean | undefined;
  indicator?: JSX.Element;
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const id = createUniqueId();
  return (
    <li class={s.row}>
      <span class={s.time}>{props.time}</span>
      <div class={s.disclosure}>
        <button
          class={s.trigger}
          type="button"
          aria-expanded={open()}
          aria-controls={id}
          onClick={() => setOpen(!open())}
        >
          {props.indicator}
          <span class={s.summary}>
            <span>
              {props.title} <span class={s.target}>{props.target}</span>
            </span>
            <span class={s.detail} data-failed={props.failed}>
              {props.outcome} <span class={s.target}>{props.duration}</span>
            </span>
          </span>
          <span aria-hidden="true">{open() ? "−" : "+"}</span>
        </button>
        <div class={s.expanded} id={id} hidden={!open()}>
          {props.children}
        </div>
      </div>
    </li>
  );
}
