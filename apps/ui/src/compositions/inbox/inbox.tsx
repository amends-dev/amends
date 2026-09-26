import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./inbox.css.ts";

/**
 * What has come to the reader, newest first. Compose Root > Item, and Item > Header(Unread +
 * Reason + Meta) + Quote or Note + Actions. Root is a list; name it with `aria-label`.
 */
export function Root(props: JSX.HTMLAttributes<HTMLUListElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <ul {...native} class={classes(s.root, local.class, local.classList)} />;
}
export type ItemProps = JSX.HTMLAttributes<HTMLLIElement> & {
  /** The reader has seen it: its quote recedes. */
  seen?: boolean;
  /** What it points to is open beside the list. */
  current?: boolean;
};
/** One notification, as a card. */
export function Item(props: ItemProps) {
  const [local, native] = splitProps(props, ["seen", "current", "class", "classList"]);
  return (
    <li
      {...native}
      data-seen={local.seen ? "true" : undefined}
      data-current={local.current ? "true" : undefined}
      class={classes(s.item, local.class, local.classList)}
    />
  );
}
export function Header(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.header, local.class, local.classList)} />;
}
/** Marks what is still pending for the reader. It names itself with `label`. */
export function Unread(
  props: Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children" | "aria-label"> & { label: string },
) {
  const [local, native] = splitProps(props, ["label", "class", "classList"]);
  return (
    <span
      {...native}
      role="img"
      aria-label={local.label}
      class={classes(s.unread, local.class, local.classList)}
    />
  );
}
/** Why it came to the reader, such as who mentioned them where. */
export function Reason(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.reason, local.class, local.classList)} />;
}
/** Secondary context at the end of the header, such as when. */
export function Meta(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.meta, local.class, local.classList)} />;
}
/** What was said, up to three lines. */
export function Quote(props: JSX.BlockquoteHTMLAttributes<HTMLQuoteElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <blockquote {...native} class={classes(s.quote, local.class, local.classList)} />;
}
/** Plain secondary text in place of a quote, such as why there is nothing to show. */
export function Note(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <p {...native} class={classes(s.note, local.class, local.classList)} />;
}
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.actions, local.class, local.classList)} />;
}
export type OpenProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "type"> & {
  href: string;
};
/**
 * The link to what the notification points to, shaped like a primary button. Set
 * `aria-current` while it is open.
 */
export function Open(props: OpenProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <a {...native} class={classes(s.open, local.class, local.classList)} />;
}
