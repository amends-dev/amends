import { Show, splitProps, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { Badge } from "../components/badge/index.ts"
import { Theme } from "../foundations/theme/index.ts"
import { classes } from "../internal/props.ts"
import { container } from "./layout.css.ts"
import * as s from "./section.css.ts"

export type Tone = "panel" | "canvas" | "inverse"

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** The surface behind it. `inverse` is dark in both modes, for the section that turns to code. */
  tone?: Tone
}

/** One band of a page, its content lined up to the site's column. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["tone", "class", "children"])
  const section = () => (
    <section {...native} class={classes(s.section, s.tone[local.tone ?? "panel"], local.class)}>
      <div class={classes(container, s.content)}>{local.children}</div>
    </section>
  )
  return (
    <Show when={local.tone === "inverse"} fallback={section()}>
      <Theme mode="dark">{section()}</Theme>
    </Show>
  )
}

export type HeaderProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** `split` sets the `Intro` beside the heading on wide screens. Default stack. */
  layout?: "stack" | "split"
}

/** The section's `Eyebrow`, `Title`, and `Intro`. */
export function Header(props: HeaderProps) {
  const [local, native] = splitProps(props, ["layout", "class"])
  return <div {...native} class={classes(s.header[local.layout ?? "stack"], local.class)} />
}

/** Groups the `Eyebrow` and `Title`, so a split header keeps them together. */
export function Heading(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.heading, local.class)} />
}

/** A short label above the title, such as "For developers". */
export function Eyebrow(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <p {...native} class={classes(s.eyebrow, local.class)} />
}

export type TitleProps = JSX.HTMLAttributes<HTMLHeadingElement> & {
  /** `heading` is the smaller size, for a page's own sections. Default section. */
  size?: "section" | "heading"
  /** Default h2. */
  level?: 2 | 3
}

export function Title(props: TitleProps) {
  const [local, native] = splitProps(props, ["size", "level", "class"])
  return (
    <Dynamic
      component={`h${local.level ?? 2}`}
      {...native}
      class={classes(s.title[local.size ?? "section"], local.class)}
    />
  )
}

export function Intro(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <p {...native} class={classes(s.intro, local.class)} />
}

export type SplitProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Give the end column more room, as for code beside a short text. Default even. */
  wider?: "end"
}

/** Two columns on wide screens, stacked on narrow ones: each child is one column. */
export function Split(props: SplitProps) {
  const [local, native] = splitProps(props, ["wider", "class"])
  return <div {...native} class={classes(s.split, local.wider === "end" && s.widerEnd, local.class)} />
}

/** One column of a `Split`. */
export function Part(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.splitPart, local.class)} />
}

export type GridProps = JSX.HTMLAttributes<HTMLUListElement> & {
  /** Columns on wide screens; two on tablets, one on phones. */
  columns: 2 | 3 | 4
}

/** A list of cards, each child an `<li>`. */
export function Grid(props: GridProps) {
  const [local, native] = splitProps(props, ["columns", "class"])
  return <ul {...native} class={classes(s.grid, s.columns[local.columns], local.class)} />
}

export function Actions(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <div {...native} class={classes(s.actions, local.class)} />
}

/** Terms and what they are, one `Row` each, between divider lines. */
export function Rows(props: JSX.HTMLAttributes<HTMLDListElement>) {
  const [local, native] = splitProps(props, ["class"])
  return <dl {...native} class={classes(s.rows, local.class)} />
}

export type RowProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Set in the code face, such as a package's name. */
  term: string
}

export function Row(props: RowProps) {
  const [local, native] = splitProps(props, ["term", "class", "children"])
  return (
    <div {...native} class={classes(s.row, local.class)}>
      <dt class={s.term}>{local.term}</dt>
      <dd class={s.definition}>{local.children}</dd>
    </div>
  )
}

export type NoteProps = Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & {
  title: string
  /** A word beside the title, such as "Coming soon". */
  badge?: string
}

/** A boxed aside, such as what is coming. */
export function Note(props: NoteProps) {
  const [local, native] = splitProps(props, ["title", "badge", "class", "children"])
  return (
    <aside {...native} class={classes(s.note, local.class)}>
      <p class={s.noteTitle}>
        {local.title}
        <Show when={local.badge}>{(badge) => <Badge class={s.soon}>{badge()}</Badge>}</Show>
      </p>
      <p class={s.noteText}>{local.children}</p>
    </aside>
  )
}
