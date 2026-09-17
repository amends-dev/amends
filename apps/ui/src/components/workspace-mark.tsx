import * as s from "./workspace-mark.css.ts";
export function WorkspaceMark(props: { name: string; size?: "regular" | "large" }) {
  return (
    <span class={s.root} data-size={props.size} data-theme="cotton" aria-hidden="true">
      {Array.from(props.name.trim())[0]?.toUpperCase() ?? "A"}
    </span>
  );
}
