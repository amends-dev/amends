/**
 * The shell that frames a workspace: the rail on the canvas, then one card holding the sidebar, the
 * main pane, and, while a thread or details are open, the side pane. Below 64rem the sidebar, and
 * below 48rem the rail with it, leave the frame for a drawer that a menu button opens.
 */

import * as Button from "@foldkit/ui/button"
import type { Html, HtmlBuilder } from "foldkit/html"
import { iconButton } from "./control.ts"

const shellFrame =
  "relative flex h-[var(--amends-screen-height,100dvh)] gap-2 overflow-hidden bg-canvas py-2 pe-2 max-tablet:gap-0 max-tablet:p-0 max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pr-[env(safe-area-inset-right)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:pl-[env(safe-area-inset-left)]"

const railSlot =
  "flex flex-none max-tablet:fixed max-tablet:inset-y-0 max-tablet:start-0 max-tablet:z-30 max-tablet:bg-canvas max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:transition-[translate,visibility] max-tablet:duration-150 motion-reduce:transition-none"

const railDrawerClosed = "max-tablet:invisible max-tablet:-translate-x-79 max-tablet:rtl:translate-x-79"

const railDrawerOpen = "max-tablet:visible max-tablet:translate-x-0"

const shellCard = "relative flex min-h-0 min-w-0 flex-1 bg-panel"

const sidebarSlot =
  "flex flex-none max-desktop:fixed max-desktop:inset-y-0 max-desktop:start-13 max-desktop:z-30 max-desktop:bg-panel max-desktop:shadow-modal max-desktop:transition-[translate,visibility] max-desktop:duration-150 max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pb-[env(safe-area-inset-bottom)] motion-reduce:transition-none"

const sidebarDrawerClosed = "max-desktop:invisible max-desktop:-translate-x-79 max-desktop:rtl:translate-x-79"

const sidebarDrawerOpen = "max-desktop:visible max-desktop:translate-x-0"

const shellDivider = "w-px flex-none self-stretch bg-divider max-desktop:hidden"

const menuSlot = "absolute start-2 top-2 z-10 desktop:hidden"

const menuScrim = "fixed inset-0 z-20 size-full cursor-default bg-scrim focus-ring-inset desktop:hidden"

const asideColumn =
  "flex w-110 flex-none flex-col border-s border-divider bg-panel max-split:absolute max-split:inset-y-0 max-split:end-0 max-split:z-20 max-split:w-[min(27.5rem,100%)] max-split:border-s-0 max-split:shadow-popover max-tablet:w-full max-tablet:shadow-none"

const asideScrim = "absolute inset-0 z-10 hidden bg-scrim max-split:block max-tablet:hidden"

export type ShellMenu<Message> = Readonly<{
  /** Sent by the menu button, which opens the drawer. */
  onOpen: Message
  /** Sent by the scrim while the drawer is open, which closes it. */
  onClose: Message
}>

/**
 * The rail, then a card of the `sidebar`, the `main` pane, and, when given, the `aside`. Each is what its
 * module renders. The `notices`, a `toastStack`, come last in the frame, over everything, pinned to its
 * bottom end corner. The frame is as tall as the viewport (`100dvh`, or `--amends-screen-height` where an
 * ancestor sets it, as the workshop does).
 *
 * The layout follows the window's width:
 *
 * - From 80rem the aside sits beside the main pane at 440px. From 64rem to there it floats over the right of
 *   the card with a shadow, above a scrim over the rest.
 * - Below 64rem the sidebar is a 264px drawer beside the rail, out of view until the menu button opens it.
 *   The aside still floats, over a scrim, down to 48rem.
 * - Below 48rem the rail is in the drawer too, before the sidebar. The frame has no gutter and leaves room
 *   for the screen's safe areas, and the aside is full screen over the main pane, which keeps its state
 *   under it; the aside's own Back, `paneBack`, is the way out.
 *
 * The `menu` opens and closes the drawer. The shell draws its button, named Menu, at the top start of the
 * card over the main pane's header, below 64rem, and, while `isMenuOpen`, a button named Close menu that
 * is a scrim over the rest of the window. Without a `menu` the drawer stays shut. The drawer is moved with
 * CSS alone: it does not trap focus, make the rest of the window inert, or close on Escape.
 */
export const shell = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    rail: Html
    sidebar: Html
    main: Html
    aside?: Html
    notices?: Html
    menu?: ShellMenu<Message>
    isMenuOpen?: boolean
  }>
): Html => {
  const { menu } = config
  const isDrawerOpen = menu !== undefined && config.isMenuOpen === true

  return h.div(
    [h.Class(shellFrame)],
    [
      h.div([h.Class(`${railSlot} ${isDrawerOpen ? railDrawerOpen : railDrawerClosed}`)], [config.rail]),
      h.div(
        [h.Class(shellCard)],
        [
          h.div(
            [h.Class(`${sidebarSlot} ${isDrawerOpen ? sidebarDrawerOpen : sidebarDrawerClosed}`)],
            [config.sidebar]
          ),
          h.div([h.AriaHidden(true), h.Class(shellDivider)]),
          menu === undefined
            ? h.empty
            : h.div([h.Class(menuSlot)], [iconButton(h, { icon: "menu", label: "Menu", onClick: menu.onOpen })]),
          config.main,
          config.aside === undefined ? h.empty : h.div([h.Class(asideColumn)], [config.aside])
        ]
      ),
      config.aside === undefined ? h.empty : h.div([h.AriaHidden(true), h.Class(asideScrim)]),
      menu === undefined || !isDrawerOpen
        ? h.empty
        : Button.view(
            {
              onClick: menu.onClose,
              toView: (attributes) =>
                h.button([...attributes.button, h.AriaLabel("Close menu"), h.Class(menuScrim)], [])
            },
            h
          ),
      config.notices ?? h.empty
    ]
  )
}
