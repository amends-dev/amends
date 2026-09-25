import { createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./list-detail.css.ts";
/** Selection belongs to the caller. At narrow widths only the selected detail is displayed. */
export function Root(props: JSX.HTMLAttributes<HTMLDivElement> & { selected: boolean }) {
  const [local, native] = splitProps(props, ["selected", "children", "class", "classList"]);
  const [narrow, setNarrow] = createSignal(false);
  onMount(() => {
    const media = window.matchMedia("(max-width: 63.999rem)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    onCleanup(() => media.removeEventListener("change", update));
  });
  return (
    <div
      {...native}
      data-selected={local.selected}
      data-narrow={narrow()}
      class={classes(s.root, local.class, local.classList)}
    >
      <div class={s.grid}>{local.children}</div>
    </div>
  );
}
export function List(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.list, local.class, local.classList)} />;
}
export function Detail(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <section {...native} class={classes(s.detail, local.class, local.classList)} />;
}
export function Back(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <a {...native} class={classes(s.back, local.class, local.classList)} />;
}
