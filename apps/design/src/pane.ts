/**
 * The third and fourth layout patterns: the main content and the side panel beside it, one structure
 * of a header, tabs or a subtitle, a body that scrolls, and a footer that stays in place.
 */

import * as Button from "@foldkit/ui/button"
import * as Predicate from "effect/Predicate"
import type { Html, HtmlBuilder } from "foldkit/html"
import { hint, iconButton } from "./control.ts"
import { form } from "./form.ts"
import { type IconName, icon } from "./icon.ts"
import { logo } from "./logo.ts"
import { type MarkContent, type MarkStatus, type TaskStatusShape, mark, taskStatus } from "./mark.ts"
import { type StateArtKind, stateArt } from "./stateArt.ts"

const paneRoot = "flex min-h-0 min-w-0 flex-1 flex-col"

const headerBand =
  "flex min-h-24 flex-none flex-col px-6 shadow-[inset_0_-1px_0_var(--amends-divider)] max-desktop:min-h-26"

const titleRows = {
  main: "flex h-15 flex-none items-center max-desktop:ps-10",
  side: "flex h-15 flex-none items-center"
}

const backSlot = "-ms-4 me-2 flex flex-none items-center tablet:hidden"

const closeSlot = "flex flex-none items-center max-tablet:hidden"

const titleBlock = "flex min-w-0 flex-1 items-center gap-3"

const titleText = "flex min-w-0 items-baseline gap-2"

const titleTextStacked = `${titleText} max-tablet:flex-col max-tablet:items-start max-tablet:gap-0`

const titlePhoneContext = "hidden min-w-0 truncate text-control leading-4.5 text-ink-secondary max-tablet:block"

const hiddenStatus = "sr-only"

const titleMain = "m-0 min-w-0 truncate text-title font-medium text-ink"

const titleSide = "m-0 min-w-0 truncate text-body font-medium text-ink"

const titleIcon = { main: "flex flex-none text-ink", side: "flex flex-none text-ink-secondary" }

const titleContext = "min-w-0 truncate text-control text-ink-secondary"

const actionsRow = "flex flex-none items-center gap-2 ps-4"

const tabsSlot = "mt-auto flex"

const subtitleLine = "m-0 truncate pt-1.5 pb-3 text-control leading-4.5 text-ink-secondary"

const bodyScroll = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5"

const bodyScrollUnderToolbar = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-0 pb-5"

const bodyAtEnd = "flex flex-col *:flex-none [&>:first-child]:mt-auto"

const toolbarStack = "flex flex-col gap-3"

const toolbarBand = `${toolbarStack} flex-none px-6 pt-5 max-desktop:pt-4 max-tablet:pb-3`

const toolbarRow = "flex items-center gap-2 max-tablet:flex-wrap"

const toolbarEnd = "ms-auto flex items-center gap-2 max-tablet:ms-0"

const footerBar = "flex-none px-6 py-5"

const tabList = "flex gap-6"

const tabButton =
  "relative inline-flex h-9 flex-none cursor-pointer items-center gap-1.5 bg-transparent p-0 text-item text-ink-secondary focus-ring hover:text-ink aria-selected:font-medium aria-selected:text-ink aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-indicator"

const tabCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const emptyColumn = "mx-auto flex max-w-80 flex-col items-center gap-1 pt-16 text-center"

const emptyArt = "mb-3 flex flex-none text-ink"

const emptyTitle = "m-0 text-item font-medium text-ink"

const emptyAction = "mt-3 flex"

const measuredColumnBody = "flex max-w-170 flex-col gap-10 pt-1"

const wideColumnBody = "flex flex-col gap-10 pt-1"

const stackBody = "flex flex-col gap-7"

const sectionColumn = "flex flex-col gap-3"

const sectionHeading = "flex flex-wrap items-baseline gap-x-2"

const stitchedSectionHeading = "flex min-h-8 items-center gap-3"

const sectionStitch = "h-0 min-w-6 flex-1 border-t border-dashed border-stitch"

const sectionTitle = "m-0 text-item font-medium text-ink"

export type PaneVariant = "main" | "side"

export type PaneHeader = Readonly<{
  title: string
  /** A drawing before the title. */
  icon?: IconName
  /** Where a task stands, drawn before the title at 1rem, in place of an `icon`. */
  taskStatus?: TaskStatusShape
  /** A small square of letters before the title, for a person or an agent, in place of an `icon`. */
  mark?: MarkContent
  /** How what the `mark` stands for stands, as the patch on it. */
  status?: MarkStatus | undefined
  /** A quieter word after the title, such as where it is. */
  context?: string
  /**
   * A quieter line under the title on phones only, such as the workspace's name, which they have no room for beside it.
   */
  phoneContext?: string
  /** A control before the title that brings its own spacing, such as `paneBack`. */
  leading?: Html
  /** Controls at the right, such as `iconButton`s, a `button`, and `paneClose`. */
  actions?: ReadonlyArray<Html>
  /** The `paneTabs` under the title. */
  tabs?: Html
  /** A line under the title, when it has no tabs. */
  subtitle?: string
}>

export type PaneTab<Message> = Readonly<{
  label: string
  count?: number
  isCurrent: boolean
  onClick: Message
}>

export type PaneColumnOptions = Readonly<{
  /** Drops the measure, so the column spans the pane, for a list. */
  isWide?: boolean
}>

const renderTitleLeading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  variant: PaneVariant,
  header: PaneHeader
): Html => {
  if (header.icon !== undefined) {
    return h.span([h.Class(titleIcon[variant])], [icon(h, header.icon, { size: variant === "main" ? "md" : "sm" })])
  }

  if (header.taskStatus !== undefined) {
    return h.span([h.Class(titleIcon[variant])], [taskStatus(h, header.taskStatus, { size: "1rem" })])
  }

  return header.mark === undefined
    ? h.empty
    : mark(h, { ...header.mark, status: header.status, statusPlacement: "below" })
}

const renderTitle = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  variant: PaneVariant,
  header: PaneHeader
): Html => {
  const heading =
    variant === "main" ? h.h1([h.Class(titleMain)], [header.title]) : h.h2([h.Class(titleSide)], [header.title])

  return h.div(
    [h.Class(titleBlock)],
    [
      renderTitleLeading(h, variant, header),
      h.div(
        [h.Class(header.phoneContext === undefined ? titleText : titleTextStacked)],
        [
          heading,
          header.mark === undefined || header.status === undefined
            ? h.empty
            : h.span([h.Class(hiddenStatus)], [header.status.label]),
          header.context === undefined ? h.empty : h.span([h.Class(titleContext)], [header.context]),
          header.phoneContext === undefined ? h.empty : h.span([h.Class(titlePhoneContext)], [header.phoneContext])
        ]
      )
    ]
  )
}

const renderHeader = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  variant: PaneVariant,
  header: PaneHeader
): Html =>
  h.div(
    [h.Class(headerBand)],
    [
      h.div(
        [h.Class(titleRows[variant])],
        [header.leading ?? h.empty, renderTitle(h, variant, header), h.div([h.Class(actionsRow)], header.actions ?? [])]
      ),
      header.tabs === undefined ? h.empty : h.div([h.Class(tabsSlot)], [header.tabs]),
      header.tabs === undefined && header.subtitle !== undefined
        ? h.p([h.Class(subtitleLine)], [header.subtitle])
        : h.empty
    ]
  )

/**
 * The main content, the page's `main` landmark, or the side panel, an `aside` named by `label`: the
 * `header` (96px, 104px below 64rem, so the two line up and the sidebar's header beside them; the main
 * pane's title starts after the shell's menu button there), the `toolbar` over a list, if it has one, the `body`
 * that scrolls, and the `footer`, such as the composer, that stays in place under it. The main title is an `h1` at
 * title size, the side title an `h2` at body size; a `label` also names the main landmark.
 *
 * The `toolbar` is what stays under the header while the list scrolls: a `paneToolbar` of the search, the filters,
 * and the actions, then, if the list has them, the line that says what it holds and its `columns`. The body then
 * starts flush under it, so the first row is the one under the columns.
 *
 * The body's first element rests against its start unless the `anchor` is `bottom`, which a conversation takes: where
 * it is shorter than the body it rests against the footer's composer, as `apps/ui`'s timeline does, and where it is
 * taller the body scrolls as it does for any other. An anchored body says so as `data-anchor="bottom"`, which is how a
 * program that keeps a conversation at its end finds the body that scrolls it.
 */
export const pane = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    variant: PaneVariant
    label?: string
    header: PaneHeader
    toolbar?: ReadonlyArray<Html>
    body: ReadonlyArray<Html>
    anchor?: "top" | "bottom"
    footer?: ReadonlyArray<Html>
  }>
): Html => {
  const attributes = [...(config.label === undefined ? [] : [h.AriaLabel(config.label)]), h.Class(paneRoot)]
  const scroll = config.toolbar === undefined ? bodyScroll : bodyScrollUnderToolbar
  const children = [
    renderHeader(h, config.variant, config.header),
    config.toolbar === undefined ? h.empty : h.div([h.Class(toolbarBand)], config.toolbar),
    config.anchor === "bottom"
      ? h.div([h.DataAttribute("anchor", "bottom"), h.Class(`${scroll} ${bodyAtEnd}`)], config.body)
      : h.div([h.Class(scroll)], config.body),
    config.footer === undefined ? h.empty : h.div([h.Class(footerBar)], config.footer)
  ]

  return config.variant === "main" ? h.main(attributes, children) : h.aside(attributes, children)
}

/**
 * The row at the top of a list's `toolbar`: the `start` controls, a `searchField` and the menus that narrow the
 * list, then, at the end, the actions on it, such as a sort and a `button` that adds to it. It is one row where the
 * search gives way first; on a phone it wraps, the search taking a line of its own and the actions the line under it.
 */
export const paneToolbar = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ start: ReadonlyArray<Html>; end?: ReadonlyArray<Html> }>
): Html =>
  h.div(
    [h.Class(toolbarRow)],
    [
      ...config.start,
      config.end === undefined || config.end.length === 0 ? h.empty : h.div([h.Class(toolbarEnd)], config.end)
    ]
  )

/**
 * The pieces of a `toolbar` as one element, 12px apart as the toolbar keeps them, for a view that is given only one
 * element to return, such as a Block's, when the Block draws the toolbar of a pane that another draws.
 */
export const paneToolbarStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(toolbarStack)], children)

/**
 * The tabs under a title, a `tablist` named by `label`, each a button that sends its `onClick`. The
 * current tab is `aria-selected`, darker, with a 2px bar over the header's line. A `count` shows in a
 * small badge after the label, and describes the tab, which the label names.
 */
export const paneTabs = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; tabs: ReadonlyArray<PaneTab<Message>> }>
): Html =>
  h.div(
    [h.Role("tablist"), h.AriaLabel(config.label), h.Class(tabList)],
    config.tabs.map((tab) =>
      Button.view(
        {
          onClick: tab.onClick,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.Role("tab"),
                h.AriaSelected(tab.isCurrent),
                h.AriaLabel(tab.label),
                ...(tab.count === undefined ? [] : [h.AriaDescription(`${tab.count}`)]),
                h.Class(tabButton)
              ],
              [
                tab.label,
                tab.count === undefined ? h.empty : h.span([h.AriaHidden(true), h.Class(tabCount)], [`${tab.count}`])
              ]
            )
        },
        h
      )
    )
  )

const copyLines = (copy: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> => {
  if (copy === undefined) {
    return []
  }

  return Predicate.isString(copy) ? [copy] : copy
}

/**
 * What a pane's body says when it has nothing to list, or a centered screen when it has nothing to show: 64px under the
 * header, centered, the `art` that draws the state, then the `title` as an `h2`, under the pane's `h1`, and the `copy`
 * under it, a line of what to do or why, in quiet text, or several lines, each its own paragraph, and the `action`
 * under that, such as a `button` that does it, 12px below. The text is centered and 20rem wide at most. The `art` is
 * one of the `stateArt` kinds, or `working`, the logo at 3.5rem in its working motion, for what is waited on: the
 * column is then a live region, a `status`, so that what it says is announced. A screen whose message is all it has,
 * such as one that says the host cannot be reached, makes the title its `h1` with `level` 1; under a heading, as a list
 * that is empty does, it stays an `h2`.
 */
export const paneEmpty = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    art: StateArtKind | "working"
    title: string
    copy?: string | ReadonlyArray<string>
    action?: Html
    level?: 1 | 2
  }>
): Html =>
  h.div(
    [...(config.art === "working" ? [h.Role("status")] : []), h.Class(emptyColumn)],
    [
      h.span(
        [h.Class(emptyArt)],
        [config.art === "working" ? logo(h, { size: "3.5rem", motion: "working" }) : stateArt(h, config.art)]
      ),
      config.level === 1 ? h.h1([h.Class(emptyTitle)], [config.title]) : h.h2([h.Class(emptyTitle)], [config.title]),
      ...copyLines(config.copy).map((line) => hint(h, line)),
      config.action === undefined ? h.empty : h.div([h.Class(emptyAction)], [config.action])
    ]
  )

/**
 * The one column of a pane's body, its sections 40px apart, with nothing beside it. It keeps a measure of 42.5rem
 * for what is read and filled in, such as a page about one item or a form, and with `isWide` spans the pane, for a
 * list or a table, which the pane's width serves.
 */
export const paneColumn = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>,
  options: PaneColumnOptions = {}
): Html => h.div([h.Class(options.isWide === true ? wideColumnBody : measuredColumnBody)], children)

/**
 * The body of a side pane that is about one thing, such as a task: its properties, its description, and its
 * activity, one under the other, 28px apart, with nothing beside them. It spans the pane, which is narrow.
 */
export const paneStack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(stackBody)], children)

/**
 * A section of a pane's column, a `section` named by `title`: the title as an `h3`, with the `trailing`
 * pieces after it on the same line, such as `sending` or a `badge`, then the `children` in a column, 12px
 * apart. With `hasStitch` the heading is a line of its own, 32px tall, with a dashed rule running from the
 * title to the pane's edge, as the sections of a page about one item are set apart.
 */
export const paneSection = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    title: string
    trailing?: ReadonlyArray<Html>
    hasStitch?: boolean
    children: ReadonlyArray<Html>
  }>
): Html =>
  h.section(
    [h.AriaLabel(config.title), h.Class(sectionColumn)],
    [
      config.hasStitch === true
        ? h.div(
            [h.Class(stitchedSectionHeading)],
            [
              h.h3([h.Class(sectionTitle)], [config.title]),
              ...(config.trailing ?? []),
              h.span([h.AriaHidden(true), h.Class(sectionStitch)])
            ]
          )
        : h.div([h.Class(sectionHeading)], [h.h3([h.Class(sectionTitle)], [config.title]), ...(config.trailing ?? [])]),
      ...config.children
    ]
  )

/**
 * A section of a pane's column that is one form, named and titled alike: a `paneSection` of the `title` holding a
 * `pane` form of that name, which sends `onSubmit` and holds the `children`, its fields and buttons. It takes the
 * section's `hasStitch`.
 */
export const paneForm = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ title: string; onSubmit: Message; hasStitch?: boolean }>,
  children: ReadonlyArray<Html>
): Html =>
  paneSection(h, {
    title: config.title,
    ...(config.hasStitch === undefined ? {} : { hasStitch: config.hasStitch }),
    children: [form(h, { onSubmit: config.onSubmit, label: config.title, variant: "pane" }, children)]
  })

/**
 * The side panel's close button, named Close unless `label` names what it closes, such as "Close task", for the
 * header's `actions`. It shows from 48rem; below that the side panel is full screen and `paneBack` is its way out.
 */
export const paneClose = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  onClick: Message,
  label = "Close"
): Html => h.span([h.Class(closeSlot)], [iconButton(h, { icon: "mark-close", label, onClick })])

/**
 * The side panel's Back button, named Back unless `label` names where it goes back to, such as "Back to Members",
 * for the header's `leading`. It shows below 48rem, where the side panel is full screen over the main pane, and
 * sends the same message as `paneClose` does.
 */
export const paneBack = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  onClick: Message,
  label = "Back"
): Html => h.span([h.Class(backSlot)], [iconButton(h, { icon: "mark-back", label, onClick })])
