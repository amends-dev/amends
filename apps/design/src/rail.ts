/**
 * The first layout pattern: the leftmost column of global destinations, on the canvas beside the
 * card of the sidebar and main pane. Each destination is an icon-only button named by its label.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"

const railColumn = "flex w-13 flex-none flex-col items-center pt-2.5 pb-3.25"

const railTarget = "relative grid size-10 flex-none place-items-center p-0 max-desktop:size-11"

const railBrand = `${railTarget} cursor-pointer bg-transparent text-title font-medium text-ink focus-ring`

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
  /** The mark's letter. */
  letter: string
  label: string
  /** The mark is a button when it has one. */
  onClick?: Message
}>

export type RailAccount<Message> = Readonly<{ letter: string; label: string; onClick: Message }>

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
    ? h.span([h.Role("img"), h.AriaLabel(brand.label), h.Class(railBrand)], [brand.letter])
    : Button.view(
        {
          onClick: brand.onClick,
          toView: (attributes) =>
            h.button([...attributes.button, h.AriaLabel(brand.label), h.Class(railBrand)], [brand.letter])
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
 * The column of destinations, a `nav` named Destinations: the `brand` mark with a short line under it,
 * the `items`, and at the bottom the `footer` items and the optional `account` mark. The current item is
 * `aria-current="true"`, filled, with a 2px bar at the rail's left edge. A brand with no `onClick` is a
 * mark and no button.
 */
export const rail = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    brand: RailBrand<Message>
    items: ReadonlyArray<RailItem<Message>>
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
        config.items.map((item) => renderDestination(h, item))
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
