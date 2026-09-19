import { createEffect, on, children, Show, type JSX } from "solid-js";
import * as s from "./conversation-layout.css.ts";

export function ConversationLayout(props: {
  label: string;
  empty?: boolean;
  children: JSX.Element;
  composer: JSX.Element;
  header?: JSX.Element;
  revision?: number;
}) {
  const headerSlot = children(() => props.header);
  let body!: HTMLDivElement;
  createEffect(
    on(
      () => props.revision,
      () => {
        queueMicrotask(() => body?.scrollTo({ top: body.scrollHeight, behavior: "instant" }));
      },
      { defer: true },
    ),
  );
  return (
    <section class={s.root} aria-label={props.label}>
      <Show when={headerSlot()}>
        <div class={s.header}>{headerSlot()}</div>
      </Show>
      <div
        ref={(node) => {
          body = node;
        }}
        class={s.body}
        data-empty={props.empty}
        tabindex="0"
        aria-label={`${props.label} messages`}
      >
        {props.children}
      </div>
      <footer class={s.footer}>{props.composer}</footer>
    </section>
  );
}
