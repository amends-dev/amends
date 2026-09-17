import { Show, type JSX } from "solid-js";
import * as s from "./collection-view.css.ts";
export interface CollectionViewProps {
  label: string;
  header?: JSX.Element;
  footer?: JSX.Element;
  children: JSX.Element;
}
/** Fills a height-constrained parent. The footer occupies its own row outside the scroller. */
export function CollectionView(props: CollectionViewProps) {
  return (
    <div class={s.root}>
      <Show when={props.header}>
        <div class={s.header}>{props.header}</div>
      </Show>
      <div class={s.body} role="region" aria-label={props.label} tabindex="0">
        {props.children}
      </div>
      <Show when={props.footer}>
        <footer class={s.footer}>{props.footer}</footer>
      </Show>
    </div>
  );
}
