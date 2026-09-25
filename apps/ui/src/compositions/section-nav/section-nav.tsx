import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./section-nav.css.ts";
/** Links between app-owned sections, preserving native navigation and browser history. */
export function Root(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <nav {...native} class={classes(s.root, local.class, local.classList)} />;
}
export function Link(props: JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <a {...native} class={classes(s.link, local.class, local.classList)} />;
}
