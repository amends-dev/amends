/**
 * The shell that frames a workspace: the rail on the canvas, then one card holding the sidebar, the
 * main pane, and, while a thread or details are open, the side pane. Below 64rem the sidebar, and
 * below 48rem the rail with it, leave the frame for a drawer that a menu button opens.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { iconButton } from "./control.ts"
import type { ModalRender } from "./modal.ts"
import type { Viewport } from "./viewport.ts"

const shellFrame =
  "relative flex h-[var(--amends-screen-height,100dvh)] gap-2 overflow-hidden bg-canvas py-2 pe-2 max-tablet:gap-0 max-tablet:p-0 max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pr-[env(safe-area-inset-right)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:pl-[env(safe-area-inset-left)]"

const shellCard = "relative flex min-h-0 min-w-0 flex-1 bg-panel"

const shellDivider = "w-px flex-none self-stretch bg-divider"

const menuSlot = "absolute start-2 top-2 z-10"

const asideColumn =
  "flex w-110 flex-none flex-col border-s border-divider bg-panel max-split:absolute max-split:inset-y-0 max-split:end-0 max-split:z-20 max-split:w-[min(27.5rem,100%)] max-split:border-s-0 max-split:shadow-popover max-tablet:w-full max-tablet:shadow-none"

const asideScrim = "absolute inset-0 z-10 hidden bg-scrim max-split:block max-tablet:hidden"

const drawerDialogLook = "m-0 max-h-none max-w-none bg-transparent p-0"

const drawerBackdropLook = "fixed inset-0 bg-scrim"

const drawerPanelLook =
  "fixed inset-y-0 flex bg-panel text-ink shadow-modal transition-[translate] duration-150 starting:-translate-x-full starting:rtl:translate-x-full max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pr-[env(safe-area-inset-right)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:pl-[env(safe-area-inset-left)] motion-reduce:transition-none"

const drawerAtEdge = "start-0"

const drawerBesideRail = "start-13"

const drawerRailLook = "flex flex-none bg-canvas"

const drawerTitleLook = "sr-only"

/** What a viewport keeps in the frame; the drawer holds the rest of the navigation. */
type Frame = Readonly<{ hasRail: boolean; hasSidebar: boolean }>

const frames: Record<Viewport, Frame> = {
  Phone: { hasRail: false, hasSidebar: false },
  Tablet: { hasRail: true, hasSidebar: false },
  Desktop: { hasRail: true, hasSidebar: true },
  Split: { hasRail: true, hasSidebar: true }
}

export type ShellMenu<Message, Requirements> = Readonly<{
  /** Sent by the menu button, which opens the drawer. */
  onOpen: Message
  /**
   * The drawer's dialog, which the page lends the shell from the `DialogBlock` it binds: the page embeds the
   * dialog's view with the `toView` it is given, and the shell decides what the drawer holds.
   */
  dialog: (toView: (render: ModalRender<Message, Requirements>) => Html) => Html
}>

/**
 * The dialog `render` describes, as a panel at the start of the window over a scrim while it is visible, and
 * nothing while it is not: an `sr-only` heading named Navigation, the `rail` when the frame does not hold it,
 * then the `sidebar`. The panel sits beside the rail when the frame holds it. It slides in; closing is
 * instant, since the dialog is not animated.
 */
const drawer = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  parts: Readonly<{ rail?: Html; sidebar: Html }>
): Html =>
  h.dialog(
    [...render.dialog, h.Class(drawerDialogLook)],
    render.isVisible
      ? [
          h.div([...render.backdrop, h.Class(drawerBackdropLook)]),
          h.div(
            [
              ...render.panel,
              h.Class(`${drawerPanelLook} ${parts.rail === undefined ? drawerBesideRail : drawerAtEdge}`)
            ],
            [
              h.h2([...render.title, h.Class(drawerTitleLook)], ["Navigation"]),
              parts.rail === undefined ? h.empty : h.div([h.Class(drawerRailLook)], [parts.rail]),
              parts.sidebar
            ]
          )
        ]
      : []
  )

/**
 * The rail, then a card of the `sidebar`, the `main` pane, and, when given, the `aside`. Each is what its
 * module renders. The `notices`, a `toastStack`, come last in the frame, over everything, pinned to its
 * bottom end corner. The frame is as tall as the viewport (`100dvh`, or `--amends-screen-height` where an
 * ancestor sets it, as the workshop does).
 *
 * The `viewport` is the window's width, which the app keeps in its model, and the layout follows it:
 *
 * - `Split`, from 80rem: the rail and the sidebar in place, and the aside beside the main pane at 440px.
 * - `Desktop`, from 64rem to there: the rail and the sidebar in place, and the aside floating over the right
 *   of the card with a shadow, above a scrim over the rest.
 * - `Tablet`, from 48rem to 64rem: the rail in place, the sidebar in the drawer, and the aside floating.
 * - `Phone`, below 48rem: the rail and the sidebar in the drawer. The frame has no gutter and leaves room
 *   for the screen's safe areas, and the aside is full screen over the main pane, which keeps its state
 *   under it; the aside's own Back, `paneBack`, is the way out.
 *
 * The `menu` is the drawer. Where the frame lacks the sidebar the shell draws a button named Menu at the top
 * start of the card over the main pane's header, which sends `onOpen`, and the drawer in `menu.dialog`, a
 * native dialog that the framework opens: it traps focus, makes the rest of the window inert, closes on Escape
 * and on a click on the scrim, and returns focus when it closes. Without a `menu` there is no button and no
 * dialog at any viewport, and where the frame lacks the sidebar it is simply absent; where the frame holds the
 * sidebar the `menu` is not used. The aside's floating and full-screen layouts are CSS alone and do none of that.
 */
export const shell = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    viewport: Viewport
    rail: Html
    sidebar: Html
    main: Html
    aside?: Html
    notices?: Html
    menu?: ShellMenu<Message, Requirements>
  }>
): Html => {
  const { hasRail, hasSidebar } = frames[config.viewport]
  const menu = hasSidebar ? undefined : config.menu

  return h.div(
    [h.Class(shellFrame)],
    [
      hasRail ? config.rail : h.empty,
      h.div(
        [h.Class(shellCard)],
        [
          hasSidebar ? config.sidebar : h.empty,
          hasSidebar ? h.div([h.AriaHidden(true), h.Class(shellDivider)]) : h.empty,
          menu === undefined
            ? h.empty
            : h.div([h.Class(menuSlot)], [iconButton(h, { icon: "menu", label: "Menu", onClick: menu.onOpen })]),
          config.main,
          config.aside === undefined ? h.empty : h.div([h.Class(asideColumn)], [config.aside])
        ]
      ),
      config.aside === undefined ? h.empty : h.div([h.AriaHidden(true), h.Class(asideScrim)]),
      menu === undefined
        ? h.empty
        : menu.dialog((render) =>
            drawer(h, render, hasRail ? { sidebar: config.sidebar } : { rail: config.rail, sidebar: config.sidebar })
          ),
      config.notices ?? h.empty
    ]
  )
}
