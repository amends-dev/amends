import { splitProps, type JSX } from "solid-js"
import { Logo } from "../../components/logo/index.ts"
import { classes } from "../../internal/props.ts"
import * as s from "./centered.css.ts"

export type RootProps = JSX.HTMLAttributes<HTMLDivElement>

/**
 * A standalone screen outside a workspace, such as sign-in or the workspace picker: a header
 * with the brand and optional actions, over one centered column.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class", "children"])
  return (
    <div {...native} class={classes(s.root, local.class)}>
      <div class={s.card}>{local.children}</div>
    </div>
  )
}

export type HeaderProps = JSX.HTMLAttributes<HTMLElement>

/** Holds Brand and, on the other side, Actions. */
export function Header(props: HeaderProps) {
  const [local, native] = splitProps(props, ["class"])
  return <header {...native} class={classes(s.header, local.class)} />
}

export type BrandProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string
}

/** The Amends mark and name. */
export function Brand(props: BrandProps) {
  const [local, native] = splitProps(props, ["class"])
  return (
    <a {...native} class={classes(s.brand, local.class)}>
      <span class={s.brandMark}>
        <Logo />
      </span>
      amends
    </a>
  )
}

export type ActionsProps = JSX.HTMLAttributes<HTMLDivElement>

/** The signed-in account and Sign out, for example. */
export function Actions(props: ActionsProps) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.actions, local.class)} />
}

export type BodyProps = JSX.HTMLAttributes<HTMLElement> & {
  /** "form" is a 420px column in the middle; "directory" is 800px from near the top. */
  width: "form" | "directory"
}

/** The screen's content. */
export function Body(props: BodyProps) {
  const [local, native] = splitProps(props, ["class", "width"])
  return <main {...native} data-width={local.width} class={classes(s.body, local.class)} />
}
