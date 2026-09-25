import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./page-columns.css.ts";

/** Persistent primary content and aside; both remain visible when the layout stacks. */
export function Root(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["children", "class", "classList"]);
  return (
    <div {...native} class={classes(s.root, local.class, local.classList)}>
      <div class={s.grid}>{local.children}</div>
    </div>
  );
}
export function Primary(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.primary, local.class, local.classList)} />;
}
export function Aside(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <aside {...native} class={classes(s.aside, local.class, local.classList)} />;
}
