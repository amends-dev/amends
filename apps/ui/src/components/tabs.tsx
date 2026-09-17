import * as K from "@kobalte/core/tabs";
import { createRenderEffect, For, on, type JSX } from "solid-js";
import * as s from "./tabs.css.ts";
export interface TabsProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly { value: string; label: string; content: JSX.Element }[];
  /** Shows both companion panels without unmounting their content when available width changes. */
  split?: boolean;
}
export function Tabs(props: TabsProps) {
  let list: HTMLDivElement | undefined;
  const panels = new Map<string, HTMLDivElement>();
  createRenderEffect(
    on(
      () => props.split,
      (split) => {
        const active = document.activeElement;
        if (split && list?.contains(active)) {
          queueMicrotask(() => panels.get(props.value)?.focus({ preventScroll: true }));
        } else if (!split) {
          const focused = [...panels].find(([, panel]) => panel.contains(active));
          if (focused && focused[0] !== props.value) props.onChange(focused[0]);
        }
      },
      { defer: true },
    ),
  );
  return (
    <K.Root class={s.root} data-split={props.split} value={props.value} onChange={props.onChange}>
      <K.List
        ref={(node) => {
          list = node;
        }}
        class={s.list}
        aria-label={props.label}
      >
        <For each={props.items}>
          {(item) => (
            <K.Trigger class={s.trigger} value={item.value}>
              {item.label}
            </K.Trigger>
          )}
        </For>
      </K.List>
      <For each={props.items}>
        {(item) => (
          <K.Content
            ref={(panel) => panels.set(item.value, panel)}
            class={s.panel}
            role={props.split ? "region" : "tabpanel"}
            tabIndex={0}
            value={item.value}
            forceMount
          >
            {item.content}
          </K.Content>
        )}
      </For>
    </K.Root>
  );
}
