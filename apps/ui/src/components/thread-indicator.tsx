import * as s from "./thread-indicator.css.ts";
export function ThreadIndicator(props: { label?: string; decorative?: boolean }) {
  return (
    <svg
      class={s.root}
      viewBox="0 0 120 8"
      fill="none"
      role={props.decorative ? undefined : "img"}
      aria-hidden={props.decorative || undefined}
      aria-label={props.decorative ? undefined : (props.label ?? "Running")}
    >
      <path
        class={s.thread}
        d="M2 4 H118"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-dasharray="7 6"
        stroke-linecap="round"
      />
    </svg>
  );
}
