import { onCleanup, onMount, splitProps, type JSX } from "solid-js";
import * as Divider from "../../primitives/divider/divider.tsx";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./transcript.css.ts";

/**
 * A conversation's ordered column, oldest first: day seams and entries, with an optional control
 * above them for reading earlier ones. Name the Root with `aria-label`.
 */
export function Root(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <section {...native} class={classes(s.root, local.class, local.classList)} />;
}
/** Above the entries: a control to read earlier ones, or a note that there are none. */
export function Earlier(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.earlier, local.class, local.classList)} />;
}
const scrolls = (element: Element) =>
  /^(auto|scroll|overlay)$/.test(getComputedStyle(element).overflowY);
/** The element that scrolls the transcript: its nearest scrolling ancestor, or the document. */
const scrollerOf = (element: Element): Element | null => {
  if (!element.isConnected) return null;
  for (let node = element.parentElement; node; node = node.parentElement)
    if (scrolls(node)) return node;
  return document.scrollingElement;
};
/** How close to the end counts as reading the newest entries. */
const near = 24;
/**
 * The entries, as an ordered list of Day and Entry items. The view opens at the newest end and
 * stays there as entries arrive while the reader is there; otherwise entries added or resized
 * anywhere keep the entry the reader is looking at in place, in every browser.
 */
export function Items(props: JSX.HTMLAttributes<HTMLOListElement>) {
  const [local, native] = splitProps(props, ["class", "classList", "ref"]);
  let list!: HTMLOListElement;
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    let scroller: Element | null = null,
      height = 0,
      // The first entry the reader can see, and where it was, as browsers anchor scrolling.
      anchor: Element | null = null,
      offset = 0;
    const edge = (element: Element) =>
      element === document.scrollingElement ? 0 : element.getBoundingClientRect().top;
    const remember = () => {
      anchor = null;
      if (!scroller) return;
      const top = edge(scroller);
      // A day seam can stay first while entries arrive after it, so only entries anchor.
      for (const child of list.children)
        if (
          !child.hasAttribute("data-transcript-day") &&
          child.getBoundingClientRect().bottom > top
        ) {
          anchor = child;
          offset = child.getBoundingClientRect().top;
          return;
        }
    };
    let unlisten = () => {};
    const listen = (element: Element) => {
      unlisten();
      const target = element === document.scrollingElement ? window : element;
      target.addEventListener("scroll", remember, { passive: true });
      unlisten = () => target.removeEventListener("scroll", remember);
    };
    // Layout has changed but nothing is painted yet, so corrections do not flicker. The scroller
    // is found once the list is in place, and again if the list moves to another one.
    const observer = new ResizeObserver(() => {
      const current = scrollerOf(list);
      if (!current) return;
      if (current !== scroller) {
        scroller = current;
        listen(current);
        current.scrollTop = current.scrollHeight;
      } else if (height - current.scrollTop - current.clientHeight <= near)
        // The reader was at the end, measured against the height before the change.
        current.scrollTop = current.scrollHeight;
      else if (anchor?.isConnected)
        current.scrollTop += anchor.getBoundingClientRect().top - offset;
      height = current.scrollHeight;
      remember();
    });
    observer.observe(list);
    onCleanup(() => {
      observer.disconnect();
      unlisten();
    });
  });
  return (
    <ol
      {...native}
      ref={(node) => {
        list = node;
        if (typeof local.ref === "function") local.ref(node);
      }}
      class={classes(s.items, local.class, local.classList)}
    />
  );
}
/** One entry, usually a Message. */
export function Entry(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <li {...native} class={classes(s.entry, local.class, local.classList)} />;
}
/** A seam naming the day the entries after it belong to. */
export function Day(
  props: Omit<JSX.LiHTMLAttributes<HTMLLIElement>, "children"> & { children: string },
) {
  const [local, native] = splitProps(props, ["class", "classList", "children"]);
  return (
    <li {...native} data-transcript-day class={classes(s.day, local.class, local.classList)}>
      <Divider.Root>
        <Divider.Line />
        <Divider.Label>{local.children}</Divider.Label>
        <Divider.Line />
      </Divider.Root>
    </li>
  );
}
/**
 * What is happening in the conversation now, such as who is typing, after the entries. It keeps
 * one line's height when empty. It is not announced; make it a live region only where every
 * change is worth hearing.
 */
export function Status(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.status, local.class, local.classList)} />;
}
