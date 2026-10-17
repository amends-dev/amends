import { splitProps, type JSX } from "solid-js"
import { Badge as ComponentBadge } from "../components/badge/index.ts"
import { classes } from "../internal/props.ts"
import * as s from "./hero.css.ts"
import { container } from "./layout.css.ts"

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /**
   * `center` stacks the `Text` above a `Preview`, centered, for the home page; `split` sets an
   * `Aside` beside the `Text` on wide screens, for a page's own headline. Default center.
   */
  layout?: "center" | "split"
}

/** The top of a page: its headline, what it is, and what to do. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["layout", "class", "children"])
  return (
    <section {...native} class={classes(s.hero, local.class)}>
      <div class={classes(container, s.layout[local.layout ?? "center"])}>{local.children}</div>
    </section>
  )
}

/** The headline's column: `Badge`, `Title`, `Lead`, and `Actions`. */
export function Text(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.text, local.class)} />
}

/** A small outlined label above the title, such as the license, or the page's name. */
export function Badge(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <p {...native} class={classes(s.badge, local.class)} />
}

export type TitleProps = JSX.HTMLAttributes<HTMLHeadingElement> & {
  /** `page` is the smaller size, for pages other than home. Default hero. */
  size?: "hero" | "page"
}

export function Title(props: TitleProps) {
  const [local, native] = splitProps(props, ["size", "class"])
  return <h1 {...native} class={classes(s.title[local.size ?? "hero"], local.class)} />
}

export function Lead(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <p {...native} class={classes(s.lead, local.class)} />
}

export type ActionsProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Center the actions, as under a centered headline. */
  centered?: boolean
}

export function Actions(props: ActionsProps) {
  const [local, native] = splitProps(props, ["centered", "class"])
  return <div {...native} class={classes(s.actions, local.centered && s.centered, local.class)} />
}

export type SoonProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** What is coming, such as "amends Cloud". */
  label: string
  /** Default "Coming soon". */
  badge?: string
}

/** Something not ready yet, beside the actions that are: it looks like one, and does nothing. */
export function Soon(props: SoonProps) {
  const [local, native] = splitProps(props, ["label", "badge", "class"])
  return (
    <span {...native} class={classes(s.soon, local.class)}>
      {local.label}
      <ComponentBadge class={s.soonBadge}>{local.badge ?? "Coming soon"}</ComponentBadge>
    </span>
  )
}

/** What the page is about, shown under a centered headline, such as the app. */
export function Preview(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.preview, local.class)} />
}

/** The column beside the `Text` in a split hero, such as a diagram. */
export function Aside(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.aside, local.class)} />
}
