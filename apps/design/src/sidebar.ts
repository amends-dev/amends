/**
 * The second layout pattern: the sidebar of the destination the rail picked, listing its items under
 * labelled sections, with the workspace's name and search above and a line of its own below.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"
import type { LogoMotion } from "./logo.ts"
import {
  activityMark,
  type MarkContent,
  type MarkStatus,
  mark,
  statusMark,
  statusTooltip,
  type TaskStatusShape,
  taskStatus
} from "./mark.ts"
import { navigationTarget } from "./navigation.ts"

const sidebarColumn = "flex w-66 max-w-[calc(100vw-7.25rem)] flex-none flex-col overflow-hidden bg-panel"

const sidebarBody = "flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto overscroll-contain px-3 pt-3.75 pb-4"

const sectionsColumn = "flex flex-none flex-col gap-5.5"

const headerColumn =
  "flex min-h-24 flex-none flex-col gap-3.5 border-b border-divider px-4.5 pt-4.25 pb-1.75 max-desktop:min-h-26"

const workspaceButton =
  "group flex h-7 w-full cursor-pointer items-center gap-2.5 bg-transparent p-0 text-start focus-ring max-desktop:h-11"

const workspaceName = "min-w-0 flex-1 truncate text-body font-medium text-ink"

const workspaceChevron = "ms-auto flex size-3.5 flex-none text-ink-secondary group-hover:text-ink [&>svg]:size-full"

const searchButton =
  "flex h-7.5 w-full cursor-pointer items-center gap-2 bg-search px-2.5 text-start text-control text-ink-muted focus-ring hover:text-ink-secondary max-desktop:h-11"

const searchLabel = "min-w-0 flex-1 truncate"

const searchShortcut = "flex-none text-meta"

const sectionColumn = "flex flex-none flex-col gap-1.5"

const sectionHeading =
  "relative flex h-7 items-center gap-1 ps-2 has-[[aria-current=page]]:bg-selected has-[[aria-current=page]]:indicator-bar max-desktop:h-11"

const sectionLabel = "min-w-0 flex-1 truncate text-meta font-medium text-ink-muted uppercase"

const sectionTitleButton =
  "block w-full cursor-pointer truncate bg-transparent p-0 text-start text-meta font-medium text-ink-muted uppercase focus-ring-inset after:absolute after:inset-0 aria-[current=page]:text-ink"

const sectionActions = "relative flex flex-none items-center gap-1"

const itemList = "m-0 flex list-none flex-col gap-1 p-0"

const itemRow =
  "relative flex h-9.5 w-full cursor-pointer items-center gap-2.5 bg-transparent px-3 text-start text-item text-ink-secondary focus-ring-inset hover:bg-hover hover:[--amends-status-knockout:var(--amends-hover)] aria-[current=page]:bg-selected aria-[current=page]:[--amends-status-knockout:var(--amends-selected)] aria-[current=page]:font-medium aria-[current=page]:text-ink aria-[current=page]:indicator-bar max-desktop:h-11"

const itemIcon = "flex flex-none text-ink-secondary"

const itemLabel = "min-w-0 flex-1 truncate"

const itemLabelUnread = "font-medium text-ink"

const itemUnread = "me-1 inline-block size-1.75 flex-none rounded-full bg-indicator"

const hiddenStatus = "sr-only"

const itemCount =
  "inline-grid h-5 min-w-5 flex-none place-items-center bg-subtle px-1.25 text-meta font-medium text-ink-secondary tabular-nums"

const itemPending = "flex-none text-meta text-ink-muted"

const itemActivity = "flex flex-none text-ink-secondary"

const subItemList = "m-0 mt-1 flex list-none flex-col gap-1 p-0"

const subItemColumn = "ms-9.25"

const subItemLook =
  "relative flex h-8 w-full items-center gap-2 bg-transparent px-2 text-start text-hint text-ink-secondary aria-[current=page]:bg-selected aria-[current=page]:text-ink aria-[current=page]:indicator-bar max-desktop:h-11"

const subItemButton = `${subItemLook} cursor-pointer focus-ring-inset hover:bg-hover`

const subItemConnector = "pointer-events-none absolute -start-4.75 -top-1 h-[calc(50%+0.28125rem)] w-4.5 text-stitch"

const emptyLine = "flex min-h-9.5 items-center px-3 text-control text-ink-muted max-desktop:min-h-11"

const footerBar = "flex-none border-t border-divider p-3"

export type SidebarSubItem<Message> = Readonly<{
  icon?: IconName
  /** Where a task stands, drawn in place of the `icon`, with the status's word for assistive technology. */
  taskStatus?: Readonly<{ shape: TaskStatusShape; label: string }>
  label: string
  isCurrent: boolean
  /** The row is a button when it has one, and a plain row that only says where the person is otherwise. */
  onClick?: Message
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

const renderSubItemLeading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  subItem: SidebarSubItem<Message>
): Html => {
  if (subItem.taskStatus !== undefined) {
    return h.span(
      [h.Class(itemIcon)],
      [taskStatus(h, subItem.taskStatus.shape), h.span([h.Class(hiddenStatus)], [`${subItem.taskStatus.label}, `])]
    )
  }

  return subItem.icon === undefined ? h.empty : h.span([h.Class(itemIcon)], [icon(h, subItem.icon, { size: "xs" })])
}

const renderSubItemContent = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  subItem: SidebarSubItem<Message>
): ReadonlyArray<Html> => [
  renderConnector(h),
  renderSubItemLeading(h, subItem),
  h.span([h.Class(itemLabel)], [subItem.label])
]

const renderSubItem = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  subItem: SidebarSubItem<Message>
): Html => {
  const current = subItem.isCurrent ? [h.AriaCurrent("page")] : []
  const { onClick } = subItem

  return h.li(
    [h.Class(subItemColumn)],
    [
      onClick === undefined
        ? h.span([...current, h.Class(subItemLook)], renderSubItemContent(h, subItem))
        : Button.view(
            {
              onClick,
              toView: (attributes) =>
                h.button(
                  [...attributes.button, h.DataAttribute("sidebar-target", ""), ...current, h.Class(subItemButton)],
                  renderSubItemContent(h, subItem)
                )
            },
            h
          )
    ]
  )
}

const renderItemLeading = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  leading: Readonly<{ icon?: IconName; mark?: MarkContent; status?: MarkStatus | undefined }>
): Html => {
  if (leading.icon !== undefined) {
    return h.span([h.Class(itemIcon)], [icon(h, leading.icon, { size: "sm" })])
  }

  return leading.mark === undefined ? h.empty : mark(h, { ...leading.mark, status: leading.status })
}

type ItemEnd = Readonly<{
  mark?: MarkContent
  status?: MarkStatus | undefined
  count?: number
  activity?: string
  activityMotion?: LogoMotion | undefined
  isPending?: boolean
  isUnread?: boolean
}>

/** The count in its badge, or, when the row has none, the dot of activity the person has not seen. */
const renderItemTally = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, config: ItemEnd): Html => {
  if (config.count !== undefined) {
    return h.span([h.AriaHidden(true), h.Class(itemCount)], [`${config.count}`])
  }

  return config.isUnread === true ? h.span([h.AriaHidden(true), h.Class(itemUnread)]) : h.empty
}

/**
 * What a row shows at its end, after its label: "Sending…" while it is pending, and otherwise the logo's mark while
 * it is at work, the shape of its status when it has no mark of its own to carry it, and the count or the unread dot.
 */
const renderItemEnd = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: ItemEnd
): ReadonlyArray<Html> => {
  if (config.isPending === true) {
    return [h.span([h.AriaHidden(true), h.Class(itemPending)], ["Sending…"])]
  }

  return [
    config.activity === undefined
      ? h.empty
      : h.span([h.AriaHidden(true), h.Class(itemActivity)], [activityMark(h, config.activityMotion)]),
    config.status === undefined || config.mark !== undefined
      ? h.empty
      : statusTooltip(h, config.status, [statusMark(h, config.status.kind)]),
    renderItemTally(h, config)
  ]
}

/** What names the row besides its label: its status's word, or its activity's words while it has no status. */
const itemName = (config: Readonly<{ label: string; status?: MarkStatus | undefined; activity?: string }>): string => {
  const state = config.status?.label ?? config.activity
  return state === undefined ? config.label : `${config.label}, ${state}`
}

const unreadDescription = "new activity"

/**
 * What describes the row: "Sending…" while it is pending, and otherwise its count, with what it counts when the row
 * says: "5 unread", and "5" alone when it does not, or "new activity" when it has no count and is unread.
 */
const itemDescription = (
  config: Readonly<{ count?: number; countName?: string; isPending?: boolean; isUnread?: boolean }>
): string | undefined => {
  if (config.isPending === true) {
    return "Sending…"
  }

  if (config.count === undefined) {
    return config.isUnread === true ? unreadDescription : undefined
  }

  return config.countName === undefined ? `${config.count}` : `${config.count} ${config.countName}`
}

/**
 * Selects the current interactive sidebar row, whether a link or a button, for the navigation
 * drawer to focus when it opens. Noninteractive current rows, such as thread labels, are excluded.
 */
export const currentSidebarRowSelector = '[data-sidebar] [data-sidebar-target][aria-current="page"]'

/**
 * The sidebar, a `nav` named by `label`: the `header` above the `children` that scroll, and the `footer`
 * below them when there is one. `header` is a `sidebarHeader`, `children` are `sidebarSection`s, and
 * `footer` is a `sidebarFooter`. It says `data-sidebar`, which `currentSidebarRowSelector` goes by.
 */
export const sidebar = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; header: Html; children: ReadonlyArray<Html>; footer?: Html }>
): Html =>
  h.nav(
    [h.AriaLabel(config.label), h.DataAttribute("sidebar", ""), h.Class(sidebarColumn)],
    [config.header, h.div([h.Class(sidebarBody)], config.children), config.footer ?? h.empty]
  )

/**
 * The 96px band at the top of the sidebar, as tall as the main pane's header beside it: the workspace as one button
 * that sends `onClick`, such as the way to the person's other workspaces, made of its `mark` letter on a 28px square,
 * its `name`, and a chevron at the end, and under it the `search` that opens a search, with the `shortcut` that does
 * too, when given. A line runs under the band. The button is named by the workspace's `name`.
 */
export const sidebarHeader = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    mark: string
    name: string
    onClick: Message
    search?: Readonly<{ label: string; shortcut?: string; onClick: Message }>
  }>
): Html => {
  const { search } = config

  return h.div(
    [h.Class(headerColumn)],
    [
      Button.view(
        {
          onClick: config.onClick,
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.Class(workspaceButton)],
              [
                mark(h, { text: config.mark, size: "account" }),
                h.span([h.Class(workspaceName)], [config.name]),
                h.span([h.AriaHidden(true), h.Class(workspaceChevron)], [icon(h, "chevron-down", { size: "sm" })])
              ]
            )
        },
        h
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

const renderSectionLabel = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; onTitleClick?: Message; titleHref?: string | undefined; isTitleCurrent?: boolean }>
): Html => {
  const { onTitleClick } = config

  return h.h2(
    [h.Class(sectionLabel)],
    [
      onTitleClick === undefined && config.titleHref === undefined
        ? config.label
        : navigationTarget(
            h,
            { onClick: onTitleClick, href: config.titleHref },
            [
              h.DataAttribute("sidebar-target", ""),
              ...(config.isTitleCurrent === true ? [h.AriaCurrent("page")] : []),
              h.Class(sectionTitleButton)
            ],
            [config.label]
          )
    ]
  )
}

/**
 * A group of items under an uppercase `label` that is a heading, with icon-only `actions` at its right,
 * such as search and create. Without a `label` it is the list alone, as the first group of a sidebar is.
 *
 * The title is a button that sends `onTitleClick` when the section has the full list of what it holds to open,
 * and covers the whole heading but its actions. While that list shows, `isTitleCurrent`, the heading is filled
 * like a current row, with the 2px bar, and the button is `aria-current="page"`.
 *
 * `children` are `sidebarItem`s, or a `sidebarEmpty` when there are none; with an empty list of them the
 * section is its heading and actions alone, which open what the section would list.
 */
export const sidebarSection = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    label?: string
    onTitleClick?: Message
    titleHref?: string | undefined
    isTitleCurrent?: boolean
    actions?: ReadonlyArray<Html>
    children: ReadonlyArray<Html>
  }>
): Html =>
  h.div(
    [h.Class(sectionColumn)],
    [
      config.label === undefined
        ? h.empty
        : h.div(
            [h.Class(sectionHeading)],
            [
              renderSectionLabel(h, { ...config, label: config.label }),
              h.div([h.Class(sectionActions)], config.actions ?? [])
            ]
          ),
      config.children.length === 0 ? h.empty : h.ul([h.Class(itemList)], config.children)
    ]
  )

/**
 * The sections a Block renders for the sidebar, in a column with the gap the sidebar's body puts between
 * its own sections, so they lie among them as if the sidebar had made them. `children` are
 * `sidebarSection`s.
 */
export const sidebarSections = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(sectionsColumn)], children)

/**
 * A row of the sidebar as one button that sends `onClick`: an `icon`, or a `mark` on a 24px square for a person,
 * a workspace, or an agent, then the `label` and a `count` at the end. A `status` is how the item stands: a patch
 * on its mark, or, for an item with an `icon` or no mark, its shape alone, 9px, at the row's end. A row has an
 * `activity`, such as "Working in #design", while what it stands for is at work, and shows the logo's mark at its
 * end, moving as its `activityMotion` says, `working` unless given, since its words say what it is doing. A row is
 * `isPending` while what it stands for is on its way, such as a group still being created, and says "Sending…" at its
 * end in place of those and the count. A row is `isUnread` while what it stands for has activity the person has not
 * seen: its label reads in `ink` and medium weight, and a 7px dot of `indicator` closes the row where the count would
 * be, which a row with a count does not draw.
 *
 * The button is named by the label and then by the status's word, "Atlas, Needs setup", or by the activity's words
 * when there is no status, and described by "Sending…", the count, or "new activity" for the dot. The count is a bare
 * number to the eye, so `countName` says what it counts, as `apps/ui` does: "unread" for the inbox, "to triage" for
 * Triage, "for you" for a group, read aloud as "5 unread"; a row that gives none is described by the number alone. The
 * patch is cut out of the row's own surface: while the row is hovered or current, `status-knockout` is that row's
 * color. The current row is filled with the 2px bar and `aria-current="page"`. `children` are the items under it,
 * such as a group's open thread, joined to it by a dashed line; one with no `onClick` is a plain row that says where
 * the person is.
 */
export const sidebarItem = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    icon?: IconName
    mark?: MarkContent
    status?: MarkStatus | undefined
    label: string
    count?: number
    countName?: string
    activity?: string
    activityMotion?: LogoMotion | undefined
    isPending?: boolean
    isUnread?: boolean
    isCurrent: boolean
    onClick: Message
    href?: string | undefined
    children?: ReadonlyArray<SidebarSubItem<Message>>
  }>
): Html => {
  const description = itemDescription(config)
  const labelLook = config.isUnread === true ? `${itemLabel} ${itemLabelUnread}` : itemLabel

  return h.li(
    [],
    [
      navigationTarget(
        h,
        config,
        [
          h.DataAttribute("sidebar-target", ""),
          h.AriaLabel(itemName(config)),
          ...(description === undefined ? [] : [h.AriaDescription(description)]),
          ...(config.isCurrent ? [h.AriaCurrent("page")] : []),
          h.Class(itemRow)
        ],
        [renderItemLeading(h, config), h.span([h.Class(labelLook)], [config.label]), ...renderItemEnd(h, config)]
      ),

      config.children === undefined || config.children.length === 0
        ? h.empty
        : h.ul(
            [h.Class(subItemList)],
            config.children.map((subItem) => renderSubItem(h, subItem))
          )
    ]
  )
}

/** A quiet line for a section that has no items yet, lined up with the labels of the items. */
export const sidebarEmpty = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.li([h.Class(emptyLine)], [text])

/** The strip at the bottom of the sidebar, under a line, for something of the workspace's own. */
export const sidebarFooter = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(footerBar)], children)
