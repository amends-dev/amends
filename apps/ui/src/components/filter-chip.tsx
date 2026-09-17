import { type JSX, Show } from "solid-js";
import { StatusIndicator } from "./status-indicator.tsx";
import * as s from "./filter-chip.css.ts";
import { Identity, type IdentityData } from "./identity.tsx";

export interface FilterChipProps {
  label: string;
  appearance?: "soft" | "solid";
  icon?: JSX.Element;
  identityKind?: IdentityData["kind"];
  count?: number;
  selected: boolean;
  onChange: (selected: boolean) => void;
  disabled?: boolean;
  indicator?: "neutral" | "pending" | "success" | "danger" | undefined;
}

/** An independent filter toggle. Its label must describe the filter even when an indicator is present. */
export function FilterChip(props: FilterChipProps) {
  return (
    <button
      type="button"
      class={s.chip}
      data-appearance={props.appearance}
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.selected)}
    >
      <Show when={props.indicator}>
        {(indicator) => <StatusIndicator decorative tone={indicator()} />}
      </Show>
      <Show
        when={props.identityKind}
        fallback={
          <>
            {props.icon}
            {props.label}
          </>
        }
      >
        {(kind) => <Identity name={props.label} kind={kind()} size="compact" />}
      </Show>
      <Show when={props.count !== undefined}>
        <span>{props.count}</span>
      </Show>
    </button>
  );
}

export interface FilterChipGroupProps {
  label: string;
  children: JSX.Element;
}

/** Names related filters and wraps them while preserving each chip's touch target. */
export function FilterChipGroup(props: FilterChipGroupProps) {
  return (
    <div class={s.group} role="group" aria-label={props.label}>
      {props.children}
    </div>
  );
}
