import {
  createContext,
  createEffect,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
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
/** Brings an entry into view: the one Items was asked to show. */
const Reveal = createContext<(entry: HTMLElement) => void>();
/**
 * The entries, as an ordered list of Day, Entry, and Note items. The view opens at the newest end and
 * stays there as entries arrive while the reader is there; otherwise entries added or resized
 * anywhere keep the entry the reader is looking at in place, in every browser. A focused Entry
 * opens the view at it instead, and brings it into view whenever it becomes focused.
 */
export function Items(props: JSX.HTMLAttributes<HTMLOListElement>) {
  const [local, native] = splitProps(props, ["class", "classList", "ref", "children"]);
  let list!: HTMLOListElement;
  let scroller: Element | null = null,
    // An entry to show once the scroller is known.
    pending: HTMLElement | null = null,
    remember = () => {};
  const edge = (element: Element) =>
    element === document.scrollingElement ? 0 : element.getBoundingClientRect().top;
  /** Center an entry in the scroller, then keep the reader's place from there. */
  const center = (current: Element, entry: HTMLElement) => {
    const box = entry.getBoundingClientRect();
    const view = current === document.scrollingElement ? window.innerHeight : current.clientHeight;
    current.scrollTop += box.top - edge(current) - Math.max(0, (view - box.height) / 2);
    remember();
  };
  const reveal = (entry: HTMLElement) => {
    const current = scroller;
    if (!current) {
      pending = entry;
      return;
    }
    requestAnimationFrame(() => {
      if (entry.isConnected) center(current, entry);
    });
  };
  onMount(() => {
    if (typeof ResizeObserver === "undefined") return;
    let height = 0,
      // The first entry the reader can see, and where it was, as browsers anchor scrolling.
      anchor: Element | null = null,
      offset = 0;
    remember = () => {
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
        // Asked to show an entry, the view opens there rather than at the end.
        if (pending?.isConnected) center(current, pending);
        pending = null;
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
    >
      <Reveal.Provider value={reveal}>{local.children}</Reveal.Provider>
    </ol>
  );
}
/**
 * One entry, usually a Message. Mark the one the reader came to see `focused`: it is set apart
 * with a wash and brought into view when it becomes focused.
 */
export function Entry(props: JSX.LiHTMLAttributes<HTMLLIElement> & { focused?: boolean }) {
  const [local, native] = splitProps(props, ["class", "classList", "focused", "ref"]);
  const reveal = useContext(Reveal);
  let element: HTMLLIElement | undefined;
  createEffect(() => {
    if (local.focused && element) reveal?.(element);
  });
  return (
    <li
      {...native}
      ref={(node) => {
        element = node;
        if (typeof local.ref === "function") local.ref(node);
      }}
      data-focused={local.focused ? "true" : undefined}
      class={classes(s.entry, local.class, local.classList)}
    />
  );
}
/**
 * A quiet line between entries about the conversation rather than in it, such as someone
 * following a thread or leaving. It keeps the reader's place as entries do. Put its NoteTime last.
 */
export function Note(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <li {...native} class={classes(s.note, local.class, local.classList)} />;
}
/** When a Note's change happened, after its text. */
export function NoteTime(props: JSX.TimeHTMLAttributes<HTMLTimeElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <time {...native} class={classes(s.noteTime, local.class, local.classList)} />;
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
