import * as s from "./date-divider.css.ts";
export function DateDivider(props: { children: string }) {
  return (
    <div class={s.root}>
      <span class={s.line} aria-hidden="true" />
      <span>{props.children}</span>
      <span class={s.line} aria-hidden="true" />
    </div>
  );
}
