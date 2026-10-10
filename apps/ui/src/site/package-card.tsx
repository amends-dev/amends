import { splitProps, type JSX } from "solid-js";
import { Badge } from "../components/badge/index.ts";
import { classes } from "../internal/props.ts";
import * as s from "./package-card.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** As published, such as "@amends-dev/harness". */
  name: string;
  /** What kind of package it is, such as "Contract" or "Implements sandbox". */
  kind: string;
  version: string;
};

/** A published package: its name, kind, and version, then its `Description` and `Links`. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["name", "kind", "version", "class", "children"]);
  return (
    <article {...native} class={classes(s.card, local.class)}>
      <h3 class={s.name}>{local.name}</h3>
      <p class={s.meta}>
        {local.kind}
        <Badge class={s.version} aria-label={`Version ${local.version}`}>
          {local.version}
        </Badge>
      </p>
      {local.children}
    </article>
  );
}

export function Description(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"]);
  return <p {...native} class={classes(s.description, local.class)} />;
}

/** Where to read about it, as `Link`s. */
export function Links(props: JSX.HTMLAttributes<HTMLUListElement>) {
  const [local, native] = splitProps(props, ["class"]);
  return <ul {...native} class={classes(s.links, local.class)} />;
}

export type LinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Link(props: LinkProps) {
  const [local, native] = splitProps(props, ["class"]);
  return (
    <li>
      <a {...native} class={classes(s.link, local.class)} />
    </li>
  );
}
