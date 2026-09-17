import { For, Show } from "solid-js";
import * as s from "./capacity-indicator.css.ts";
export function CapacityIndicator(props: { used: number; capacity: number; label?: string }) {
  const slots = () =>
    Array.from(
      { length: Math.min(24, Math.max(0, Math.floor(props.capacity))) },
      (_, index) => index,
    );
  return (
    <div
      class={s.root}
      role="img"
      aria-label={
        props.label ??
        `${props.used} of ${props.capacity} slots in use${props.used > props.capacity ? ", over capacity" : ""}`
      }
    >
      <For each={slots()}>
        {(index) => <span class={s.slot} data-filled={index < props.used} aria-hidden="true" />}
      </For>
      <Show when={props.capacity > 24}>
        <span class={s.more} aria-hidden="true">
          +{props.capacity - 24}
        </span>
      </Show>
    </div>
  );
}
