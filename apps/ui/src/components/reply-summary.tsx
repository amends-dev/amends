import { Show, type JSX } from "solid-js";
import { Identity, type IdentityData } from "./identity.tsx";
import { withTooltip } from "./overlay-trigger.ts";
import type { TooltipTriggerProps } from "./tooltip.tsx";
import * as s from "./reply-summary.css.ts";
export function ReplySummary(props: {
  identity?: IdentityData;
  indicator?: JSX.Element;
  children: JSX.Element;
  note?: string;
  onClick: () => void;
  active?: boolean;
}) {
  const button = (trigger: TooltipTriggerProps = {}) => (
    <button
      {...withTooltip<HTMLButtonElement>({ onClick: () => props.onClick() }, trigger)}
      type="button"
      class={s.root}
      aria-expanded={props.active}
    >
      {trigger.children}
      {props.indicator}
      <span>{props.children}</span>
      <span class={s.note}>{props.note}</span>
    </button>
  );
  return (
    <Show when={props.identity} fallback={button()}>
      {(identity) => <Identity {...identity()} size="compact" compact trigger={button} />}
    </Show>
  );
}
