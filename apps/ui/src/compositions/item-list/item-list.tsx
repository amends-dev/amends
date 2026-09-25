import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./item-list.css.ts";

export function Root(
  props: JSX.HTMLAttributes<HTMLUListElement> & { variant?: "plain" | "outline" },
) {
  const [local, native] = splitProps(props, ["variant", "class", "classList"]);
  return (
    <ul
      {...native}
      class={classes(
        `${s.root} ${s.variants[local.variant ?? "plain"]}`,
        local.class,
        local.classList,
      )}
    />
  );
}
export function Item(props: JSX.LiHTMLAttributes<HTMLLIElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <li {...native} class={classes(s.item, local.class, local.classList)} />;
}
/** Native destination link. Keep other interactive controls outside it. */
export function Link(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <a {...native} class={classes(s.link, local.class, local.classList)} />;
}
export function Leading(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <span
      {...native}
      data-item-list-leading=""
      class={classes(s.leading, local.class, local.classList)}
    />
  );
}
export function Content(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.content, local.class, local.classList)} />;
}
export function Title(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.title, local.class, local.classList)} />;
}
export function Description(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.description, local.class, local.classList)} />;
}
export function Meta(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.meta, local.class, local.classList)} />;
}
/** Non-interactive row for content with independent actions. Never nests a button in a link. */
export function Row(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.row, local.class, local.classList)} />;
}
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.actions, local.class, local.classList)} />;
}
