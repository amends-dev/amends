import type { JSX } from "solid-js";
import * as s from "./card-grid.css.ts";
export function CardGrid(props: { children: JSX.Element }) {
  return <div class={s.root}>{props.children}</div>;
}
