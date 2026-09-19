import { children, Show, type JSX } from "solid-js";
import * as s from "./collection-view.css.ts";
export interface CollectionViewProps {
  label: string;
  header?: JSX.Element;
  footer?: JSX.Element;
  children: JSX.Element;
}
/** Fills a height-constrained parent. The footer occupies its own row outside the scroller. */
export function CollectionView(props: CollectionViewProps) {
  const headerSlot = children(() => props.header);
  const footerSlot = children(() => props.footer);
  return (
    <div class={s.root}>
      <Show when={headerSlot()}>
        <div class={s.header}>{headerSlot()}</div>
      </Show>
      <div class={s.body} role="region" aria-label={props.label} tabindex="0">
        {props.children}
      </div>
      <Show when={footerSlot()}>
        <footer class={s.footer}>{footerSlot()}</footer>
      </Show>
    </div>
  );
}
