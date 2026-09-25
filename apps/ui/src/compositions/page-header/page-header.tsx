import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./page-header.css.ts";

function part<T extends HTMLElement>(props: JSX.HTMLAttributes<T>, className: string) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return { native, className: classes(className, local.class, local.classList) };
}
/** A page's repeated header structure; applications choose the actual breadcrumbs and actions. */
export function Root(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const p = part(props, s.root);
  return <div {...p.native} class={p.className} />;
}
export function Crumbs(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const p = part(props, s.crumbs);
  return <div {...p.native} class={p.className} />;
}
export function Heading(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const p = part(props, s.heading);
  return <div {...p.native} class={p.className} />;
}
export function Title(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const p = part(props, s.title);
  return <h1 {...p.native} class={p.className} />;
}
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const p = part(props, s.actions);
  return <div {...p.native} class={p.className} />;
}
export function Meta(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const p = part(props, s.meta);
  return <p {...p.native} class={p.className} />;
}
export function Navigation(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const p = part(props, s.navigation);
  return <div {...p.native} class={p.className} />;
}
