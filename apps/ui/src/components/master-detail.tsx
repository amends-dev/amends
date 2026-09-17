import { layout } from "../tokens/index.ts";
import {
  createEffect,
  createRenderEffect,
  createSignal,
  on,
  onMount,
  onCleanup,
  type JSX,
} from "solid-js";
import { Button } from "./button.tsx";
import * as s from "./master-detail.css.ts";
export function MasterDetail(props: {
  children: JSX.Element;
  detail: JSX.Element;
  selected: boolean;
  backLabel: string;
  onBack: () => void;
}) {
  let detail!: HTMLDivElement;
  let root!: HTMLDivElement;
  const [narrow, setNarrow] = createSignal(true);
  onMount(() => {
    const observer = new ResizeObserver(([entry]) =>
      setNarrow((entry?.contentRect.width ?? 0) < layout.companionMin),
    );
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  let previous: HTMLElement | undefined;
  createRenderEffect(
    on(
      () => props.selected,
      (selected) => {
        if (selected) {
          previous =
            document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        } else if (previous?.isConnected) {
          const target = previous;
          queueMicrotask(() => target.isConnected && target.focus({ preventScroll: true }));
          previous = undefined;
        }
      },
    ),
  );
  createEffect(
    on([() => props.selected, narrow], ([selected, narrow]) => {
      if (selected && narrow && !detail?.contains(document.activeElement)) {
        queueMicrotask(() => detail?.focus({ preventScroll: true }));
      }
    }),
  );
  return (
    <div
      ref={(node) => {
        root = node;
      }}
      class={s.root}
      data-narrow={narrow()}
    >
      <div class={s.primary} data-selected={props.selected}>
        {props.children}
      </div>
      <div
        ref={(node) => {
          detail = node;
        }}
        tabindex="-1"
        class={s.detail}
        data-hidden={!props.selected}
      >
        <div class={s.back} hidden={!props.selected}>
          <Button variant="secondary" onClick={props.onBack}>
            ← {props.backLabel}
          </Button>
        </div>
        {props.detail}
      </div>
    </div>
  );
}
