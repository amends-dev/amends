import { splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./empty-state.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** `region` (default) fits a panel or list area; `page` is the whole content of a page. */
  size?: "region" | "page";
};
/**
 * The house state for an empty region or a failure: a drawing, a serif line, a sentence, and one
 * action. Compose Root > a Drawing + Text(Title + Description) + Actions. A failure uses a failure
 * drawing, never red. Root adds no role; the caller announces changes when it needs to.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["size", "class", "classList"]);
  return (
    <div
      {...native}
      data-size={local.size ?? "region"}
      class={classes(s.root, local.class, local.classList)}
    />
  );
}
/** Groups the title and description at the reference's reading width. */
export function Text(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.text, local.class, local.classList)} />;
}
export type TitleProps = JSX.HTMLAttributes<HTMLHeadingElement> & {
  /** The heading level where this state sits in the page outline. */
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};
export function Title(props: TitleProps) {
  const [local, native] = splitProps(props, ["as", "class", "classList"]);
  return (
    <Dynamic
      {...native}
      component={local.as ?? "h2"}
      class={classes(s.title, local.class, local.classList)}
    />
  );
}
export function Description(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <p {...native} class={classes(s.description, local.class, local.classList)} />;
}
/** One action by default; a second, secondary action when the reference calls for it. */
export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.actions, local.class, local.classList)} />;
}
