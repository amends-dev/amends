/**
 * The first layout pattern: the leftmost column of global destinations, on the canvas beside the
 * card of the sidebar and main pane. A destination with a `href` is a native link; otherwise it is
 * an icon-only button. Both are named by the label.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"
import { logo } from "./logo.ts"
import { mark } from "./mark.ts"
import { type MenuConfig, menu } from "./menu.ts"
import { navigationTarget } from "./navigation.ts"

const railColumn =
  "flex w-13 flex-none flex-col items-center pt-2.5 pb-3.25 [--amends-status-knockout:var(--amends-canvas)]"

const railTarget = "relative grid size-10 flex-none place-items-center p-0 max-desktop:size-11"

const railMark = `${railTarget} text-ink`

const railBrand = `${railMark} cursor-pointer bg-transparent focus-ring`

const railSeam = "mt-2.25 mb-3 h-px w-6 flex-none bg-divider"

const railDestinations = "m-0 flex list-none flex-col items-center gap-3.5 p-0"

const railFooter = "m-0 mt-auto flex list-none flex-col items-center gap-4 p-0 pt-3.5"

const railDestination = `${railTarget} cursor-pointer bg-transparent text-ink-secondary focus-ring hover:bg-subtle hover:text-ink aria-[current=true]:bg-rail-selected aria-[current=true]:text-ink aria-[current=true]:indicator-bar`

const railAccountAvatar = `${railTarget} text-ink`

export type RailItem<Message> = Readonly<{
  icon: IconName
  /** The destination's name, which is all the button says to assistive technology. */
  label: string
  isCurrent: boolean
  onClick: Message
  href?: string | undefined
}>

export type RailBrand<Message> = Readonly<{
  /** What the mark is called, such as "Amends home" for the button that goes there. */
  label: string
  /** The mark is a button when it has one. */
  onClick?: Message
  href?: string | undefined
}>

/** The way to search, which is not a destination: it is never current. */
export type RailSearch<Message> = Readonly<{ label: string; onClick: Message }>

const renderDestination = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, item: RailItem<Message>) =>
  h.li(
    [],
    [
      navigationTarget(
        h,
        item,
        [h.AriaLabel(item.label), ...(item.isCurrent ? [h.AriaCurrent("true")] : []), h.Class(railDestination)],
        [icon(h, item.icon)]
      )
    ]
  )

const renderBrand = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, brand: RailBrand<Message>) =>
  brand.onClick === undefined && brand.href === undefined
    ? h.span([h.Class(railMark)], [logo(h, { label: brand.label })])
    : navigationTarget(
        h,
        { onClick: brand.onClick, href: brand.href },
        [h.AriaLabel(brand.label), h.Class(railBrand)],
        [logo(h)]
      )

/**
 * The person's account at the foot of the rail: their mark, `initials` in a 40px target like the destinations, a
 * button named "Account: {name}" that opens the account's menu to the right of the rail, with its end at the
 * button's. The menu is the `header` over its `groups`, as `menu` has them.
 */
export const railAccount = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ name: string; initials: string }> & Pick<MenuConfig<Value>, "header" | "groups" | "embed">
): Html =>
  menu(h, {
    trigger: {
      variant: "plain",
      name: `Account: ${config.name}`,
      content: h.span([h.Class(railAccountAvatar)], [mark(h, { text: config.initials })])
    },
    placement: "right-end",
    ...(config.header === undefined ? {} : { header: config.header }),
    groups: config.groups,
    embed: config.embed
  })

/**
 * The column of destinations, a `nav` named Destinations: the `brand`, the logo with a short line under it, the
 * `items`, then the `search` when there is one, and at the bottom the `footer` items, such as Settings, and the
 * optional `account`, a `railAccount`, under them. The current item is `aria-current="true"`, filled, with a 2px bar at
 * the rail's left edge. The search is an item like the others in look and spacing, a magnifier named by its `label`,
 * and is never current. A brand with an `onClick` is a button named by its `label`, whose logo lifts its patch when
 * hovered; with none it is the logo as an image of that name. The logo is cut out of the canvas the rail lies on.
 */
export const rail = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    brand: RailBrand<Message>
    items: ReadonlyArray<RailItem<Message>>
    search?: RailSearch<Message>
    footer: ReadonlyArray<RailItem<Message>>
    account?: Html
  }>
): Html =>
  h.nav(
    [h.AriaLabel("Destinations"), h.Class(railColumn)],
    [
      renderBrand(h, config.brand),
      h.div([h.AriaHidden(true), h.Class(railSeam)]),
      h.ul(
        [h.Class(railDestinations)],
        [
          ...config.items.map((item) => renderDestination(h, item)),
          config.search === undefined
            ? h.empty
            : renderDestination(h, { icon: "mark-search", ...config.search, isCurrent: false })
        ]
      ),
      h.ul(
        [h.Class(railFooter)],
        [
          ...config.footer.map((item) => renderDestination(h, item)),
          config.account === undefined ? h.empty : h.li([], [config.account])
        ]
      )
    ]
  )
