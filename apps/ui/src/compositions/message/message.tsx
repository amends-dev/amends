import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./message.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** `comfortable` (default) for a stream; `compact` for a narrow thread panel. */
  density?: "comfortable" | "compact";
};
/**
 * One entry of a conversation, from any kind of author. Compose Root > Avatar + Content, and
 * Content > Header(Author + Time) + Body + an optional Replies link. Root is an article; name it
 * with `aria-labelledby` pointing at the Author.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["density", "class", "classList"]);
  return (
    <article
      {...native}
      data-density={local.density ?? "comfortable"}
      class={classes(s.root, local.class, local.classList)}
    />
  );
}
/** Holds one Avatar at the start of the entry. */
export function Avatar(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.avatar, local.class, local.classList)} />;
}
export function Content(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.content, local.class, local.classList)} />;
}
export function Header(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.header, local.class, local.classList)} />;
}
export function Author(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.author, local.class, local.classList)} />;
}
export type TimeProps = JSX.TimeHTMLAttributes<HTMLTimeElement> & {
  /** The machine-readable instant the visible text describes. */
  datetime: string;
};
/** When the message was published: short visible text, with the full instant as `title`. */
export function Time(props: TimeProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <time {...native} class={classes(s.time, local.class, local.classList)} />;
}
/** The message text, keeping its line breaks and indentation. */
export function Body(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <p {...native} class={classes(s.body, local.class, local.classList)} />;
}
/** A mention of someone the message addresses, inside Body. */
export function Mention(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.mention, local.class, local.classList)} />;
}
export type RepliesProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "type"> & {
  href: string;
};
/**
 * The link from an opening message to its thread. Compose ReplyCount and ReplyNote inside it;
 * set `aria-current` while that thread is open, which keeps the link filled.
 */
export function Replies(props: RepliesProps) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <a {...native} class={classes(s.replies, local.class, local.classList)} />;
}
export function ReplyCount(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.replyCount, local.class, local.classList)} />;
}
/** Secondary context: when the last reply came, or an invitation to reply. */
export function ReplyNote(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.replyNote, local.class, local.classList)} />;
}
