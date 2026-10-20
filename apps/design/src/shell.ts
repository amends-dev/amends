/**
 * The shell that frames a workspace: the rail on the canvas, then one card holding the sidebar, the
 * main pane, and, while a thread or details are open, the side pane. Below 64rem the sidebar, and
 * below 48rem the rail with it, leave the frame for a drawer that a menu button opens; below 80rem the
 * side pane leaves the card for a dialog of its own.
 */

import type { Html, HtmlBuilder } from "foldkit/html"
import { iconButton } from "./control.ts"
import type { ModalRender } from "./modal.ts"
import type { Viewport } from "./viewport.ts"

const shellFrame =
  "flex h-[var(--amends-screen-height,100dvh)] gap-2 overflow-hidden bg-canvas py-2 pe-2 max-tablet:gap-0 max-tablet:p-0 max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pr-[env(safe-area-inset-right)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:pl-[env(safe-area-inset-left)]"

const shellCard = "relative flex min-h-0 min-w-0 flex-1 bg-panel"

const shellDivider = "w-px flex-none self-stretch bg-divider"

const menuSlot = "absolute start-2 top-2 z-10"

const asideColumn = "flex w-110 flex-none flex-col border-s border-divider bg-panel"

const dialogLook = "m-0 max-h-none max-w-none bg-transparent p-0"

const drawerBackdropLook = "fixed inset-0 bg-scrim"

const drawerPanelLook =
  "fixed inset-y-0 flex bg-panel text-ink shadow-modal transition-[translate] duration-150 starting:-translate-x-full starting:rtl:translate-x-full max-tablet:pt-[env(safe-area-inset-top)] max-tablet:pr-[env(safe-area-inset-right)] max-tablet:pb-[env(safe-area-inset-bottom)] max-tablet:pl-[env(safe-area-inset-left)] motion-reduce:transition-none"

const drawerAtEdge = "start-0"

const drawerBesideRail = "start-13"

const drawerRailLook = "flex flex-none bg-canvas"

const sidePaneLooks = {
  Floating: {
    backdrop: "fixed inset-0 bg-scrim",
    panel: "fixed inset-y-2 end-2 flex w-[min(27.5rem,100%)] flex-col bg-panel text-ink shadow-popover"
  },
  FullScreen: {
    backdrop: "fixed inset-0",
    panel:
      "fixed inset-0 flex flex-col bg-panel text-ink pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
  }
}

const dialogTitleLook = "sr-only"

/** Where the side pane is at a viewport: beside the main pane, or in a dialog, floating or filling the window. */
type AsideLayout = "Beside" | "Floating" | "FullScreen"

/** What a viewport keeps in the frame; the drawer holds the rest of the navigation, a dialog the side pane. */
type Frame = Readonly<{ hasRail: boolean; hasSidebar: boolean; asideLayout: AsideLayout }>

const frames: Record<Viewport, Frame> = {
  Phone: { hasRail: false, hasSidebar: false, asideLayout: "FullScreen" },
  Tablet: { hasRail: true, hasSidebar: false, asideLayout: "Floating" },
  Desktop: { hasRail: true, hasSidebar: true, asideLayout: "Floating" },
  Split: { hasRail: true, hasSidebar: true, asideLayout: "Beside" }
}

/**
 * Whether the side pane is in a dialog at `viewport`, floating or filling the window, and not beside the main pane:
 * where the page opens its dialog, and where closing the dialog is the person leaving what the pane shows.
 */
export const isAsideInDialog = (viewport: Viewport): boolean => frames[viewport].asideLayout !== "Beside"

/** A dialog the page lends the shell from the `DialogBlock` it binds. */
export type ShellDialog<Message, Requirements> = Readonly<{
  /** Whether the dialog is open, from the `isOpen` of the `DialogBlock`'s model. */
  isOpen: boolean
  /**
   * The dialog's view, which the page embeds with the `toView` it is given: the shell decides what the
   * dialog holds.
   */
  dialog: (toView: (render: ModalRender<Message, Requirements>) => Html) => Html
}>

export type ShellMenu<Message, Requirements> = ShellDialog<Message, Requirements> &
  Readonly<{
    /** Sent by the menu button, which opens the drawer. */
    onOpen: Message
  }>

export type ShellAside<Message, Requirements> = ShellDialog<Message, Requirements> &
  Readonly<{
    /** What the side pane is, such as "Thread" or "Member details", which names the dialog that holds it elsewhere. */
    label: string
    /** The side pane, which the shell puts beside the main pane from `Split` and the dialog holds elsewhere. */
    view: Html
  }>

/** Where the notices go: in the open dialog, the only part of the window left to use, else in the frame. */
type NoticesPlace = "Menu" | "Aside" | "Frame"

const placeNotices = (dialogs: Readonly<{ isMenuOpen: boolean; isAsideOpen: boolean }>): NoticesPlace => {
  if (dialogs.isMenuOpen) {
    return "Menu"
  }

  if (dialogs.isAsideOpen) {
    return "Aside"
  }

  return "Frame"
}

/**
 * The dialog `render` describes, as a panel at the start of the window over a scrim while it is visible, and
 * nothing while it is not: an `sr-only` heading named Navigation, the `rail` when the frame does not hold it,
 * then the `sidebar`, and the `notices` after the panel. The panel sits beside the rail when the frame holds
 * it. It slides in; closing is instant, since the dialog is not animated.
 */
const drawer = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  parts: Readonly<{ rail?: Html; sidebar: Html; notices: Html }>
): Html =>
  h.dialog(
    [...render.dialog, h.Class(dialogLook)],
    render.isVisible
      ? [
          h.div([...render.backdrop, h.Class(drawerBackdropLook)]),
          h.div(
            [
              ...render.panel,
              h.Class(`${drawerPanelLook} ${parts.rail === undefined ? drawerBesideRail : drawerAtEdge}`)
            ],
            [
              h.h2([...render.title, h.Class(dialogTitleLook)], ["Navigation"]),
              parts.rail === undefined ? h.empty : h.div([h.Class(drawerRailLook)], [parts.rail]),
              parts.sidebar
            ]
          ),
          parts.notices
        ]
      : []
  )

/**
 * The dialog `render` describes, as the side pane over the rest of the window while it is visible, and nothing
 * while it is not: an `sr-only` heading named for the pane, then the `view`, and the `notices` after the panel. A
 * `Floating` panel is at the end of the window, inset by the frame's gutter, with a shadow, over a scrim; a
 * `FullScreen` one fills the window inside the screen's safe areas, over a backdrop that shows nothing.
 */
const sidePaneDialog = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  parts: Readonly<{ layout: Exclude<AsideLayout, "Beside">; label: string; view: Html; notices: Html }>
): Html =>
  h.dialog(
    [...render.dialog, h.Class(dialogLook)],
    render.isVisible
      ? [
          h.div([...render.backdrop, h.Class(sidePaneLooks[parts.layout].backdrop)]),
          h.div(
            [...render.panel, h.Class(sidePaneLooks[parts.layout].panel)],
            [h.h2([...render.title, h.Class(dialogTitleLook)], [parts.label]), parts.view]
          ),
          parts.notices
        ]
      : []
  )

/**
 * The rail, then a card of the `sidebar`, the `main` pane, and, when given, the `aside`. Each is what its
 * module renders. The frame is as tall as the viewport (`100dvh`, or `--amends-screen-height` where an
 * ancestor sets it, as the workshop does).
 *
 * The `viewport` is the window's width, which the app keeps in its model, and the layout follows it:
 *
 * - `Split`, from 80rem: the rail and the sidebar in place, and the aside's `view` beside the main pane at
 *   440px.
 * - `Desktop`, from 64rem to there: the rail and the sidebar in place, and the aside in a dialog, floating at
 *   the end of the window over a scrim.
 * - `Tablet`, from 48rem to 64rem: the rail in place, the sidebar in the drawer, and the aside floating.
 * - `Phone`, below 48rem: the rail and the sidebar in the drawer. The frame has no gutter and leaves room
 *   for the screen's safe areas, and the aside fills the window over the main pane, which keeps its state
 *   under it; the aside's own Back, `paneBack`, is the way out.
 *
 * The `menu` is the drawer. Where the frame lacks the sidebar the shell draws a button named Menu at the top
 * start of the card over the main pane's header, which sends `onOpen`, and the drawer in `menu.dialog`. Where
 * the frame holds the sidebar the `menu` is not used, and without a `menu` there is no button and no drawer
 * at any viewport, so where the frame lacks the sidebar it is simply absent.
 *
 * Whenever the `aside` is not beside the main pane it is in `aside.dialog`. Each of the two is a native dialog
 * that the framework opens: it traps focus, makes the rest of the window inert, closes on Escape and on a
 * click on the scrim, and returns focus when it closes.
 *
 * The `notices`, a `toastStack`, are pinned to the window's bottom end corner over everything. While a
 * dialog is open the rest of the window is inert, so they are inside it, after its panel, and in the frame,
 * last, when neither is open.
 *
 * The `dialogs` are dialogs of the page's own that are not the shell's, such as a search or a form in a modal,
 * each the view of a `DialogBlock` the page binds, which renders nothing while it is closed. The shell renders
 * them last in the frame, after the notices and so over the drawer and the side pane, at every viewport, since
 * a dialog the framework opens has to be in the document whether or not the sidebar or the main pane that
 * asks for it is. The notices do not move into them: the rest of the window is inert while one is open.
 */
export const shell = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    viewport: Viewport
    rail: Html
    sidebar: Html
    main: Html
    aside?: ShellAside<Message, Requirements>
    notices?: Html
    menu?: ShellMenu<Message, Requirements>
    dialogs?: ReadonlyArray<Html>
  }>
): Html => {
  const { hasRail, hasSidebar, asideLayout } = frames[config.viewport]
  const menu = hasSidebar ? undefined : config.menu
  const asideBeside = asideLayout === "Beside" ? config.aside : undefined
  const asideDialog =
    asideLayout === "Beside" || config.aside === undefined ? undefined : { ...config.aside, layout: asideLayout }
  const noticesPlace = placeNotices({ isMenuOpen: menu?.isOpen === true, isAsideOpen: asideDialog?.isOpen === true })
  const noticesIn = (place: NoticesPlace): Html => (noticesPlace === place ? (config.notices ?? h.empty) : h.empty)

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
          asideBeside === undefined ? h.empty : h.div([h.Class(asideColumn)], [asideBeside.view])
        ]
      ),
      menu === undefined
        ? h.empty
        : menu.dialog((render) =>
            drawer(
              h,
              render,
              hasRail
                ? { sidebar: config.sidebar, notices: noticesIn("Menu") }
                : { rail: config.rail, sidebar: config.sidebar, notices: noticesIn("Menu") }
            )
          ),
      asideDialog === undefined
        ? h.empty
        : asideDialog.dialog((render) =>
            sidePaneDialog(h, render, {
              layout: asideDialog.layout,
              label: asideDialog.label,
              view: asideDialog.view,
              notices: noticesIn("Aside")
            })
          ),
      noticesIn("Frame"),
      ...(config.dialogs ?? [])
    ]
  )
}
