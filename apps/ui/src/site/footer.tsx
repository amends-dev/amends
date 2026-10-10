import { splitProps, type JSX } from "solid-js";
import { Logo } from "../components/logo/index.ts";
import { classes } from "../internal/props.ts";
import { container } from "./layout.css.ts";
import * as s from "./footer.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** One line under the wordmark, such as what amends is. */
  tagline: string;
  /** The last line, such as the license. */
  legal: string;
};

/** The site's footer: the wordmark and tagline, `Column`s of links, and a legal line. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["tagline", "legal", "class", "children"]);
  return (
    <footer {...native} class={classes(s.footer, local.class)}>
      <div class={container}>
        <span class={s.seam} aria-hidden="true" />
        <div class={s.body}>
          <div class={s.brand}>
            <span class={s.mark}>
              <Logo size="1.75rem" />
              <span class={s.wordmark}>amends</span>
            </span>
            <p class={s.tagline}>{local.tagline}</p>
          </div>
          <div class={s.columns}>{local.children}</div>
        </div>
        <p class={s.legal}>{local.legal}</p>
      </div>
    </footer>
  );
}

export type ColumnProps = Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & { title: string };

/** A titled list of `Link`s. */
export function Column(props: ColumnProps) {
  const [local, native] = splitProps(props, ["title", "class", "children"]);
  return (
    <nav {...native} aria-label={local.title} class={classes(s.column, local.class)}>
      <h2 class={s.columnTitle}>{local.title}</h2>
      <ul class={s.list}>{local.children}</ul>
    </nav>
  );
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
