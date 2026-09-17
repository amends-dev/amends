import { Show, type JSX } from "solid-js";
import * as s from "./notice.css.ts";
export function Notice(props: {
  children: JSX.Element;
  indicator?: JSX.Element;
  tone?: "neutral" | "danger";
  live?: "polite" | "assertive";
}) {
  return (
    <div class={s.root} data-tone={props.tone} aria-live={props.live}>
      <Show when={props.indicator}>
        <span class={s.indicator}>{props.indicator}</span>
      </Show>
      <div>{props.children}</div>
    </div>
  );
}
