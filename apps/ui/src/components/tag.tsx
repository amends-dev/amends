import type { JSX } from "solid-js";
import * as s from "./tag.css.ts";
export function Tag(props: {
  children: JSX.Element;
  appearance?: "label" | "pill" | "plain";
  tone?: "neutral" | "success";
}) {
  return (
    <span class={s.root} data-appearance={props.appearance} data-tone={props.tone}>
      {props.children}
    </span>
  );
}
