/**
 * The third and fourth layout patterns: the main content and the side panel beside it, one structure
 * of a header, tabs or a subtitle, a body that scrolls, and a footer that stays in place.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { hint, iconButton } from "./control.ts"
import { form } from "./form.ts"
import { type IconName, icon } from "./icon.ts"
import { mark } from "./mark.ts"

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

const titleMain = "m-0 min-w-0 truncate text-title font-medium text-ink"

const titleSide = "m-0 min-w-0 truncate text-body font-medium text-ink"

const titleIcon = { main: "flex flex-none text-ink", side: "flex flex-none text-ink-secondary" }

const titleContext = "min-w-0 truncate text-control text-ink-secondary"

const actionsRow = "flex flex-none items-center gap-2 ps-4"

const tabsSlot = "mt-auto flex"

const subtitleLine = "m-0 truncate pt-1.5 pb-3 text-control leading-4.5 text-ink-secondary"

const bodyScroll = "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5"

const footerBar = "flex-none px-6 py-5"

const tabList = "flex gap-6"

const tabButton =
  "relative inline-flex h-9 flex-none cursor-pointer items-center gap-1.5 bg-transparent p-0 text-item text-ink-secondary focus-ring hover:text-ink aria-selected:font-medium aria-selected:text-ink aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-indicator"

const tabCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const emptyColumn = "mx-auto flex max-w-80 flex-col items-center gap-1 pt-16 text-center"

const emptyIcon = "mb-2 grid size-10 flex-none place-items-center bg-subtle text-ink-secondary"

const emptyTitle = "m-0 text-item font-medium text-ink"

const columnBody = "flex max-w-170 flex-col gap-10 pt-1"

const sectionColumn = "flex flex-col gap-3"

const sectionHeading = "flex flex-wrap items-baseline gap-x-2"

const sectionTitle = "m-0 text-item font-medium text-ink"

export type PaneVariant = "main" | "side"

export type PaneHeader = Readonly<{
  title: string
  /** A drawing before the title. */
  icon?: IconName
  /** A letter on a small square before the title, for a person or an agent, in place of an `icon`. */
  mark?: string
  /** A quieter word after the title, such as where it is. */
  context?: string
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

const renderTitleLeading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  variant: PaneVariant,
  header: PaneHeader
): Html => {
  if (header.icon !== undefined) {
    return h.span([h.Class(titleIcon[variant])], [icon(h, header.icon, { size: variant === "main" ? "md" : "sm" })])
  }

  return header.mark === undefined ? h.empty : mark(h, { text: header.mark })
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
        [h.Class(titleText)],
        [heading, header.context === undefined ? h.empty : h.span([h.Class(titleContext)], [header.context])]
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
 * pane's title starts after the shell's menu button there), the `body` that scrolls,
 * and the `footer`, such as the composer, that stays in place under it. The main title is an `h1` at
 * title size, the side title an `h2` at body size; a `label` also names the main landmark.
 */
export const pane = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    variant: PaneVariant
    label?: string
    header: PaneHeader
    body: ReadonlyArray<Html>
    footer?: ReadonlyArray<Html>
  }>
): Html => {
  const attributes = [...(config.label === undefined ? [] : [h.AriaLabel(config.label)]), h.Class(paneRoot)]
  const children = [
    renderHeader(h, config.variant, config.header),
    h.div([h.Class(bodyScroll)], config.body),
    config.footer === undefined ? h.empty : h.div([h.Class(footerBar)], config.footer)
  ]

  return config.variant === "main" ? h.main(attributes, children) : h.aside(attributes, children)
}

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

/**
 * What a pane's body says when it has nothing to list: 64px under the header, centered, a 40px square on
 * `subtle` holding the `icon`, then the `title` as an `h2`, under the pane's `h1`, and the `copy` under it,
 * a line of what to do or why, in quiet text. The text is centered and 20rem wide at most.
 */
export const paneEmpty = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ icon: IconName; title: string; copy?: string }>
): Html =>
  h.div(
    [h.Class(emptyColumn)],
    [
      h.span([h.Class(emptyIcon)], [icon(h, config.icon)]),
      h.h2([h.Class(emptyTitle)], [config.title]),
      config.copy === undefined ? h.empty : hint(h, config.copy)
    ]
  )

/** The one column of a page about one item, 680px at most, its sections 40px apart, with nothing beside it. */
export const paneColumn = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(columnBody)], children)

/**
 * A section of a pane's column, a `section` named by `title`: the title as an `h3`, with the `trailing`
 * pieces after it on the same line, such as `sending` or a `badge`, then the `children` in a column, 12px
 * apart.
 */
export const paneSection = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ title: string; trailing?: ReadonlyArray<Html>; children: ReadonlyArray<Html> }>
): Html =>
  h.section(
    [h.AriaLabel(config.title), h.Class(sectionColumn)],
    [
      h.div([h.Class(sectionHeading)], [h.h3([h.Class(sectionTitle)], [config.title]), ...(config.trailing ?? [])]),
      ...config.children
    ]
  )

/**
 * A section of a pane's column that is one form, named and titled alike: a `paneSection` of the `title` holding a
 * `pane` form of that name, which sends `onSubmit` and holds the `children`, its fields and buttons.
 */
export const paneForm = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ title: string; onSubmit: Message }>,
  children: ReadonlyArray<Html>
): Html =>
  paneSection(h, {
    title: config.title,
    children: [form(h, { onSubmit: config.onSubmit, label: config.title, variant: "pane" }, children)]
  })

/**
 * The side panel's close button, named Close, for the header's `actions`. It shows from 48rem; below that the
 * side panel is full screen and `paneBack` is its way out.
 */
export const paneClose = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, onClick: Message): Html =>
  h.span([h.Class(closeSlot)], [iconButton(h, { icon: "mark-close", label: "Close", onClick })])

/**
 * The side panel's Back button, named Back, for the header's `leading`. It shows below 48rem, where the side
 * panel is full screen over the main pane, and sends the same message as `paneClose` does.
 */
export const paneBack = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, onClick: Message): Html =>
  h.span([h.Class(backSlot)], [iconButton(h, { icon: "mark-back", label: "Back", onClick })])
