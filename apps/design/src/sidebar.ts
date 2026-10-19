/**
 * The second layout pattern: the sidebar of the destination the rail picked, listing its items under
 * labelled sections, with the workspace's name and search above and a line of its own below.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"

const sidebarColumn = "flex w-66 flex-none flex-col overflow-hidden bg-panel"

const sidebarBody = "flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto overscroll-contain px-3 pt-3.75 pb-4"

const headerColumn = "flex min-h-24 flex-none flex-col gap-3.5 border-b border-divider px-4.5 pt-4.25 pb-1.75"

const headerRow = "flex h-7 items-center gap-2.5"

const workspaceMark =
  "grid size-6 flex-none place-items-center bg-avatar-neutral-bg text-hint font-medium text-avatar-neutral-fg uppercase"

const workspaceName = "min-w-0 flex-1 truncate text-body font-medium text-ink"

const headerActions = "flex flex-none items-center gap-1"

const searchButton =
  "flex h-7.5 w-full cursor-pointer items-center gap-2 bg-search px-2.5 text-start text-control text-ink-muted focus-ring hover:text-ink-secondary"

const searchLabel = "min-w-0 flex-1 truncate"

const searchShortcut = "flex-none text-meta"

const sectionColumn = "flex flex-none flex-col gap-1.5"

const sectionHeading = "flex h-7 items-center gap-1 ps-2"

const sectionLabel = "min-w-0 flex-1 truncate text-meta font-medium text-ink-muted uppercase"

const sectionActions = "flex flex-none items-center gap-1"

const itemList = "m-0 flex list-none flex-col gap-1 p-0"

const itemRow =
  "relative flex h-9.5 w-full cursor-pointer items-center gap-2.5 bg-transparent px-3 text-start text-item text-ink-secondary focus-ring-inset hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:font-medium aria-[current=page]:text-ink aria-[current=page]:indicator-bar"

const itemIcon = "flex flex-none text-ink-secondary"

const itemMark =
  "grid size-5 flex-none place-items-center bg-avatar-neutral-bg text-[0.5625rem] font-medium text-avatar-neutral-fg uppercase"

const itemLabel = "min-w-0 flex-1 truncate"

const itemCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const subItemList = "m-0 mt-1 flex list-none flex-col gap-1 p-0"

const subItemColumn = "ms-9.25"

const subItemRow =
  "relative flex h-8 w-full cursor-pointer items-center gap-2 bg-transparent px-2 text-start text-hint text-ink-secondary focus-ring-inset hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:text-ink aria-[current=page]:indicator-bar"

const subItemConnector = "pointer-events-none absolute -start-4.75 -top-1 h-[calc(50%+0.28125rem)] w-4.5 text-stitch"

const emptyLine = "flex min-h-9.5 items-center px-3 text-control text-ink-muted"

const footerBar = "flex-none border-t border-divider p-3"

export type SidebarSubItem<Message> = Readonly<{
  icon?: IconName
  label: string
  isCurrent: boolean
  onClick: Message
}>

const renderConnector = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>): Html =>
  h.svg(
    [
      h.AriaHidden(true),
      h.ViewBox("0 0 18 41"),
      h.PreserveAspectRatio("xMinYMax slice"),
      h.Fill("none"),
      h.Class(subItemConnector)
    ],
    [
      h.path([
        h.D("M1 0V36Q1 40 5 40H18"),
        h.Stroke("currentColor"),
        h.StrokeWidth("1"),
        h.StrokeDasharray("7 4"),
        h.StrokeLinecap("round")
      ])
    ]
  )

const renderSubItem = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  subItem: SidebarSubItem<Message>
): Html =>
  h.li(
    [h.Class(subItemColumn)],
    [
      Button.view(
        {
          onClick: subItem.onClick,
          toView: (attributes) =>
            h.button(
              [...attributes.button, ...(subItem.isCurrent ? [h.AriaCurrent("page")] : []), h.Class(subItemRow)],
              [
                renderConnector(h),
                subItem.icon === undefined
                  ? h.empty
                  : h.span([h.Class(itemIcon)], [icon(h, subItem.icon, { size: "xs" })]),
                h.span([h.Class(itemLabel)], [subItem.label])
              ]
            )
        },
        h
      )
    ]
  )

const renderItemLeading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  leading: Readonly<{ icon?: IconName; mark?: string }>
): Html => {
  if (leading.icon !== undefined) {
    return h.span([h.Class(itemIcon)], [icon(h, leading.icon, { size: "sm" })])
  }

  return leading.mark === undefined ? h.empty : h.span([h.AriaHidden(true), h.Class(itemMark)], [leading.mark])
}

/**
 * The sidebar, a `nav` named by `label`: the `header` above the `children` that scroll, and the `footer`
 * below them when there is one. `header` is a `sidebarHeader`, `children` are `sidebarSection`s, and
 * `footer` is a `sidebarFooter`.
 */
export const sidebar = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; header: Html; children: ReadonlyArray<Html>; footer?: Html }>
): Html =>
  h.nav(
    [h.AriaLabel(config.label), h.Class(sidebarColumn)],
    [config.header, h.div([h.Class(sidebarBody)], config.children), config.footer ?? h.empty]
  )

/**
 * The 96px band at the top of the sidebar, as tall as the main pane's header beside it: the workspace's
 * `mark` letter and `name`, `actions` at the right, such as the menu that switches workspace, and under
 * them the `search` that opens a search, with the `shortcut` that does too, when given. A line runs
 * under the band.
 */
export const sidebarHeader = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    mark: string
    name: string
    actions?: ReadonlyArray<Html>
    search?: Readonly<{ label: string; shortcut?: string; onClick: Message }>
  }>
): Html => {
  const { search } = config

  return h.div(
    [h.Class(headerColumn)],
    [
      h.div(
        [h.Class(headerRow)],
        [
          h.span([h.AriaHidden(true), h.Class(workspaceMark)], [config.mark]),
          h.span([h.Class(workspaceName)], [config.name]),
          h.div([h.Class(headerActions)], config.actions ?? [])
        ]
      ),
      search === undefined
        ? h.empty
        : Button.view(
            {
              onClick: search.onClick,
              toView: (attributes) =>
                h.button(
                  [...attributes.button, h.Class(searchButton)],
                  [
                    icon(h, "mark-search", { size: "sm" }),
                    h.span([h.Class(searchLabel)], [search.label]),
                    search.shortcut === undefined
                      ? h.empty
                      : h.span([h.AriaHidden(true), h.Class(searchShortcut)], [search.shortcut])
                  ]
                )
            },
            h
          )
    ]
  )
}

/**
 * A group of items under an uppercase `label` that is a heading, with icon-only `actions` at its right,
 * such as search and create. Without a `label` it is the list alone, as the first group of a sidebar is.
 * `children` are `sidebarItem`s, or a `sidebarEmpty` when there are none.
 */
export const sidebarSection = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label?: string; actions?: ReadonlyArray<Html>; children: ReadonlyArray<Html> }>
): Html =>
  h.div(
    [h.Class(sectionColumn)],
    [
      config.label === undefined
        ? h.empty
        : h.div(
            [h.Class(sectionHeading)],
            [h.h2([h.Class(sectionLabel)], [config.label]), h.div([h.Class(sectionActions)], config.actions ?? [])]
          ),
      h.ul([h.Class(itemList)], config.children)
    ]
  )

/**
 * A row of the sidebar as one button that sends `onClick`: an `icon`, or a `mark` letter on a small square
 * for a person or a workspace, then the `label` and a `count` at the end. The button is named by the label
 * and described by the count. The current row is filled with the 2px bar and `aria-current="page"`.
 * `children` are the items under it, such as a group's open thread, joined to it by a dashed line.
 */
export const sidebarItem = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    icon?: IconName
    mark?: string
    label: string
    count?: number
    isCurrent: boolean
    onClick: Message
    children?: ReadonlyArray<SidebarSubItem<Message>>
  }>
): Html =>
  h.li(
    [],
    [
      Button.view(
        {
          onClick: config.onClick,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.AriaLabel(config.label),
                ...(config.count === undefined ? [] : [h.AriaDescription(`${config.count}`)]),
                ...(config.isCurrent ? [h.AriaCurrent("page")] : []),
                h.Class(itemRow)
              ],
              [
                renderItemLeading(h, config),
                h.span([h.Class(itemLabel)], [config.label]),
                config.count === undefined
                  ? h.empty
                  : h.span([h.AriaHidden(true), h.Class(itemCount)], [`${config.count}`])
              ]
            )
        },
        h
      ),
      config.children === undefined || config.children.length === 0
        ? h.empty
        : h.ul(
            [h.Class(subItemList)],
            config.children.map((subItem) => renderSubItem(h, subItem))
          )
    ]
  )

/** A quiet line for a section that has no items yet, lined up with the labels of the items. */
export const sidebarEmpty = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.li([h.Class(emptyLine)], [text])

/** The strip at the bottom of the sidebar, under a line, for something of the workspace's own. */
export const sidebarFooter = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(footerBar)], children)
