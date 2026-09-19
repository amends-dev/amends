import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import * as s from "./follow-latest.css.ts";

export function FollowLatest(props: { count: number; children: JSX.Element }) {
  let viewport!: HTMLDivElement;
  let content!: HTMLDivElement;
  let following = true;
  const latest = () => {
    if (following && viewport.clientHeight > 0) viewport.scrollTop = viewport.scrollHeight;
  };
  createEffect(() => {
    void props.count;
    if (viewport) latest();
  });
  onMount(() => {
    const observer = new ResizeObserver(() => {
      if (viewport.clientHeight > 0) latest();
    });
    observer.observe(content);
    observer.observe(viewport);
    onCleanup(() => observer.disconnect());
    latest();
  });
  return (
    <div class={s.root}>
      <div
        ref={(node) => {
          viewport = node;
        }}
        class={s.viewport}
        tabIndex={0}
        aria-label="Scrollable turn log"
        onScroll={() => {
          if (viewport.clientHeight > 0) {
            following = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 24;
          }
        }}
      >
        <div
          ref={(node) => {
            content = node;
          }}
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}
