import * as s from "./status-indicator.css.ts";
export type StatusTone = "neutral" | "running" | "pending" | "success" | "danger";
export type StatusIndicatorProps = {
  tone: StatusTone;
} & ({ label: string; decorative?: false } | { decorative: true; label?: never });
/** Supply a text equivalent, or mark decorative when adjacent text already names the state. */
export function StatusIndicator(props: StatusIndicatorProps) {
  return (
    <span
      class={s.dot({ tone: props.tone })}
      role={props.decorative ? undefined : "img"}
      aria-label={props.decorative ? undefined : props.label}
      aria-hidden={props.decorative || undefined}
    />
  );
}
