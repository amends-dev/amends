import { splitProps, type JSX } from "solid-js";
import { ButtonLink } from "../components/button/index.ts";
import { Logo } from "../components/logo/index.ts";
import { classes } from "../internal/props.ts";
import { container } from "./layout.css.ts";
import * as s from "./header.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement>;

/** The site's top bar: the brand, the links between its pages, and one action. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class", "children"]);
  return (
    <header {...native} class={classes(s.header, local.class)}>
      <div class={classes(container, s.bar)}>{local.children}</div>
    </header>
  );
}

export type BrandProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
};

/** The mark and the wordmark, linking home. */
export function Brand(props: BrandProps) {
  const [local, native] = splitProps(props, ["class"]);
  return (
    <a {...native} class={classes(s.brand, local.class)}>
      <Logo size="1.75rem" />
      <span class={s.wordmark}>amends</span>
    </a>
  );
}

export type LinksProps = JSX.HTMLAttributes<HTMLElement>;

/** The pages, as a list of `Link`s. */
export function Links(props: LinksProps) {
  const [local, native] = splitProps(props, ["children"]);
  return (
    <nav aria-label="Site" {...native}>
      <ul class={s.links}>{local.children}</ul>
    </nav>
  );
}

export type LinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  /** The page being read. */
  current?: boolean;
};

export function Link(props: LinkProps) {
  const [local, native] = splitProps(props, ["current", "class"]);
  return (
    <li>
      <a
        {...native}
        class={classes(s.link, local.class)}
        aria-current={local.current ? "page" : undefined}
      />
    </li>
  );
}

export type ActionProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** The one thing the site asks a reader to do, such as self-hosting. */
export function Action(props: ActionProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <ButtonLink {...native} variant="primary" class={classes(s.action, local.class)} />;
}
