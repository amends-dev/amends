import { splitProps, type JSX } from "solid-js";
import { classes } from "../internal/props.ts";
import * as s from "./feature-card.css.ts";

/** A card about one thing: an optional `Art`, a `Title`, `Text`, and an optional `Link`. */
export function Root(props: JSX.HTMLAttributes<HTMLElement>) {
  const [local, native] = splitProps(props, ["class"]);
  return <article {...native} class={classes(s.card, local.class)} />;
}

/** An illustration across the card's top, such as a `FeatureArt`. Hidden from assistive technology. */
export function Art(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} aria-hidden="true" inert class={classes(s.art, local.class)} />;
}

export type TitleProps = JSX.HTMLAttributes<HTMLHeadingElement>;

export function Title(props: TitleProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <h3 {...native} class={classes(s.title, local.class)} />;
}

export function Text(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"]);
  return <p {...native} class={classes(s.text, local.class)} />;
}

export type LinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** Where to read more, at the card's foot; its text should end in an arrow. */
export function Link(props: LinkProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <a {...native} class={classes(s.link, local.class)} />;
}
