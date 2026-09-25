import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./item-list.css.ts";

export function Root(
  props: JSX.HTMLAttributes<HTMLUListElement> & { variant?: "panel" | "outline" },
) {
  const [local, native] = splitProps(props, ["variant", "class", "classList"]);
  return (
    <ul
      {...native}
      class={classes(
        `${s.root} ${s.variants[local.variant ?? "panel"]}`,
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
