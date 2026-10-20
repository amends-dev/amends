/**
 * The first layout pattern: the leftmost column of global destinations, on the canvas beside the
 * card of the sidebar and main pane. Each destination is an icon-only button named by its label.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"
import { logo } from "./logo.ts"

const railColumn =
  "flex w-13 flex-none flex-col items-center pt-2.5 pb-3.25 [--amends-status-knockout:var(--amends-canvas)]"

const railTarget = "relative grid size-10 flex-none place-items-center p-0 max-desktop:size-11"

const railMark = `${railTarget} text-ink`

const railBrand = `${railMark} cursor-pointer bg-transparent focus-ring`

const railSeam = "mt-2.25 mb-3 h-px w-6 flex-none bg-divider"

const railDestinations = "m-0 flex list-none flex-col items-center gap-3.5 p-0"

const railFooter = "m-0 mt-auto flex list-none flex-col items-center gap-4 p-0 pt-3.5"

const railDestination = `${railTarget} cursor-pointer bg-transparent text-ink-secondary focus-ring hover:bg-subtle hover:text-ink aria-[current=true]:bg-rail-selected aria-[current=true]:text-ink aria-[current=true]:indicator-bar`

const railAccountButton = `${railTarget} cursor-pointer bg-transparent focus-ring`

const railAccountMark =
  "grid size-6 place-items-center bg-avatar-neutral-bg text-meta font-medium text-avatar-neutral-fg uppercase"

export type RailItem<Message> = Readonly<{
  icon: IconName
  /** The destination's name, which is all the button says to assistive technology. */
  label: string
  isCurrent: boolean
  onClick: Message
}>

export type RailBrand<Message> = Readonly<{
  /** What the mark is called, such as "Amends home" for the button that goes there. */
  label: string
  /** The mark is a button when it has one. */
  onClick?: Message
}>

export type RailAccount<Message> = Readonly<{ letter: string; label: string; onClick: Message }>

/** The way to search, which is not a destination: it is never current. */
export type RailSearch<Message> = Readonly<{ label: string; onClick: Message }>

const renderDestination = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, item: RailItem<Message>) =>
  h.li(
    [],
    [
      Button.view(
        {
          onClick: item.onClick,
          toView: (attributes) =>
            h.button(
              [
                ...attributes.button,
                h.AriaLabel(item.label),
                ...(item.isCurrent ? [h.AriaCurrent("true")] : []),
                h.Class(railDestination)
              ],
              [icon(h, item.icon)]
            )
        },
        h
      )
    ]
  )

const renderBrand = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, brand: RailBrand<Message>) =>
  brand.onClick === undefined
    ? h.span([h.Class(railMark)], [logo(h, { label: brand.label })])
    : Button.view(
        {
          onClick: brand.onClick,
          toView: (attributes) =>
            h.button([...attributes.button, h.AriaLabel(brand.label), h.Class(railBrand)], [logo(h)])
        },
        h
      )

const renderAccount = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, account: RailAccount<Message>) =>
  h.li(
    [],
    [
      Button.view(
        {
          onClick: account.onClick,
          toView: (attributes) =>
            h.button(
              [...attributes.button, h.AriaLabel(account.label), h.Class(railAccountButton)],
              [h.span([h.AriaHidden(true), h.Class(railAccountMark)], [account.letter])]
            )
        },
        h
      )
    ]
  )

/**
 * The column of destinations, a `nav` named Destinations: the `brand`, the logo with a short line under it,
 * the `items`, then the `search` when there is one, and at the bottom the `footer` items and the optional
 * `account` mark. The current item is `aria-current="true"`, filled, with a 2px bar at the rail's left edge.
 * The search is an item like the others in look and spacing, a magnifier named by its `label`, and is never
 * current. A brand with an `onClick` is a button named by its `label`, whose logo lifts its patch when hovered;
 * with none it is the logo as an image of that name. The logo is cut out of the canvas the rail lies on.
 */
export const rail = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    brand: RailBrand<Message>
    items: ReadonlyArray<RailItem<Message>>
    search?: RailSearch<Message>
    footer: ReadonlyArray<RailItem<Message>>
    account?: RailAccount<Message>
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
          config.account === undefined ? h.empty : renderAccount(h, config.account)
        ]
      )
    ]
  )
