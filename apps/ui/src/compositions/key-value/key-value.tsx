import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./key-value.css.ts";
export function Root(props: JSX.HTMLAttributes<HTMLDListElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <dl {...native} class={classes(s.root, local.class, local.classList)} />;
}
export function Row(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.row, local.class, local.classList)} />;
}
export function Label(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <dt {...native} class={classes(s.label, local.class, local.classList)} />;
}
export function Value(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <dd {...native} class={classes(s.value, local.class, local.classList)} />;
}
