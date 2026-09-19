import type { ParentProps } from "solid-js";
import * as s from "./content-column.css.ts";
export function ContentColumn(
  props: ParentProps<{ width?: "narrow" | "wide"; align?: "center" | "start" }>,
) {
  return (
    <div class={s.root}>
      <div
        class={s.column}
        data-width={props.width ?? "narrow"}
        data-align={props.align ?? "start"}
      >
        {props.children}
      </div>
    </div>
  );
}
