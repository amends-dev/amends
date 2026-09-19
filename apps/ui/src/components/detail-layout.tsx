import { createSignal, onMount, onCleanup, children, Show, type JSX } from "solid-js";
import { layout } from "../tokens/index.ts";
import { Tabs } from "./tabs.tsx";
import * as s from "./detail-layout.css.ts";
export function DetailLayout(props: {
  header?: JSX.Element;
  primary: JSX.Element;
  detail: JSX.Element;
  panel?: "primary" | "detail";
  onPanelChange?: (panel: "primary" | "detail") => void;
  primaryLabel?: string;
  detailLabel?: string;
}) {
  const headerSlot = children(() => props.header);
  const [panel, setPanel] = createSignal("primary");
  const [split, setSplit] = createSignal(false);
  let root!: HTMLDivElement;
  onMount(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSplit((entry?.contentRect.width ?? 0) >= layout.companionMin),
    );
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  return (
    <div
      ref={(node) => {
        root = node;
      }}
      class={s.root}
    >
      <Show when={headerSlot()}>
        <div class={s.header}>{headerSlot()}</div>
      </Show>
      <div class={s.body}>
        <Tabs
          label="Page panels"
          split={split()}
          value={props.panel ?? panel()}
          onChange={(value) => {
            if (value === "primary" || value === "detail") {
              setPanel(value);
              props.onPanelChange?.(value);
            }
          }}
          items={[
            { value: "primary", label: props.primaryLabel ?? "thread", content: props.primary },
            { value: "detail", label: props.detailLabel ?? "details", content: props.detail },
          ]}
        />
      </div>
    </div>
  );
}
