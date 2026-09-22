import { splitProps, type JSX } from "solid-js";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./breadcrumb.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement>;

/** A named navigation landmark. Its children declare the route hierarchy in order. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "children",
    "class",
    "classList",
    "aria-label",
    "aria-labelledby",
  ]);
  return (
    <nav
      {...native}
      aria-label={local["aria-label"] ?? (local["aria-labelledby"] ? undefined : "Breadcrumb")}
      aria-labelledby={local["aria-labelledby"]}
      class={classes(s.root, local.class, local.classList)}
    >
      <ol class={s.list} role="list">
        {local.children}
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <span class={s.separator} aria-hidden="true">
      /
    </span>
  );
}

export type LinkProps = Omit<
  JSX.AnchorHTMLAttributes<HTMLAnchorElement>,
  "type" | "aria-current"
> & {
  href: string;
  "aria-current"?: never;
};

/** A previous level is a native link; routing and navigation remain caller-owned. */
export function Link(props: LinkProps) {
  const [local, native] = splitProps(props, ["children", "class", "classList"]);
  return (
    <li class={s.item}>
      <Separator />
      <a {...native} class={classes(s.link, local.class, local.classList)}>
        {local.children}
      </a>
    </li>
  );
}

export type CurrentProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "aria-current"> & {
  "aria-current"?: never;
};

/** The current page is visible text, not a link back to itself. */
export function Current(props: CurrentProps) {
  const [local, native] = splitProps(props, ["children", "class", "classList"]);
  return (
    <li class={s.item}>
      <Separator />
      <span
        {...native}
        aria-current="page"
        class={classes(s.current, local.class, local.classList)}
      >
        {local.children}
      </span>
    </li>
  );
}
