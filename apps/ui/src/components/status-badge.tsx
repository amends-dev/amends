import { StatusIndicator, type StatusTone } from "./status-indicator.tsx";
import * as s from "./status-badge.css.ts";
export function StatusBadge(props: { label: string; tone: StatusTone }) {
  return (
    <span class={s.root} data-tone={props.tone}>
      <StatusIndicator tone={props.tone} decorative />
      <span>{props.label}</span>
    </span>
  );
}
