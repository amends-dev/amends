/**
 * The modal: a panel raised over a scrim for a form or a set of settings that has the person's whole attention
 * until they finish or cancel. It renders what `@foldkit/ui`'s headless dialog publishes, so the dialog's
 * element, its focus, Escape, scrim click, and labels are the framework's, and this module gives them the look.
 *
 * A Block that opens a modal:
 *
 * - binds `DialogBlock` as a child, and asks it to open and close from its update with the Binding's
 *   `requestOpen()` and `requestClose()`;
 * - embeds the dialog's view after its other markup, with `toView: (render) => modal(h, render, config)`, and
 *   `hasDescription: true` when the config has a `description`;
 * - spreads `render.initialFocus` onto the control that takes focus when the dialog opens, through the
 *   `attributes` of `field`, `textarea`, or `choiceSelect`, with a field's `isAutofocus` off.
 *
 * A modal that is a choice among things, such as the integrations a connection can go through, puts them in a
 * `modalList` after its search, so that the rows run to the panel's edges.
 */

import type { RenderInfo } from "@foldkit/ui/dialog"
import type { Html, HtmlBuilder } from "foldkit/html"
import { buttonWith, iconButtonWith } from "./control.ts"

const dialogLook = "m-0 max-h-none max-w-none bg-transparent p-0 open:grid open:place-items-center"

const backdropLook = "fixed inset-0 bg-scrim-strong"

const panelBase = "relative flex max-h-[calc(100dvh-4rem)] flex-col bg-raised shadow-modal"

const panelWidths = {
  form: "w-[min(26rem,calc(100%-2rem))]",
  wide: "w-[min(32rem,calc(100%-2rem))]",
  compact: "w-[min(35rem,calc(100%-2rem))]"
}

const headerBand = "flex flex-none flex-col px-6 shadow-[inset_0_-1px_0_var(--amends-divider)]"

const titleRow = "flex h-15 flex-none items-center"

const titleBlock = "flex min-w-0 flex-1 items-baseline gap-2"

const titleText = "m-0 min-w-0 truncate text-title font-medium text-ink"

const contextText = "min-w-0 truncate text-control text-ink-secondary"

const closeSlot = "flex flex-none items-center ps-4"

const tabsSlot = "mt-auto flex"

const bodyColumn = "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-5"

const descriptionText = "m-0 text-hint text-ink-secondary"

const listLook = "-mx-6 -mb-5 border-t border-divider"

const footerRow = "flex flex-none items-center justify-end gap-2 border-t border-divider px-6 py-4"

const footerLeading = "me-auto flex items-center gap-2"

type DialogAttribute<Message, Requirements> = Parameters<HtmlBuilder<Message, Requirements>["dialog"]>[0][number]

/**
 * What the dialog's view publishes, a `RenderInfo`, with its `dialog` group typed as the builder of the Block that
 * embeds the dialog admits it: the group carries a mount, which a builder allows once its Block binds the dialog.
 */
export type ModalRender<Message, Requirements> = Omit<RenderInfo, "dialog"> &
  Readonly<{ dialog: ReadonlyArray<DialogAttribute<Message, Requirements>> }>

export type ModalWidth = keyof typeof panelWidths

export type ModalConfig<Message> = Readonly<{
  /** Names the dialog for assistive technology, and heads the panel. */
  title: string
  /** A quieter word beside the title, such as the group the modal is about. */
  context?: string
  /** A line at the start of the body, which describes the dialog to assistive technology. */
  description?: string
  /** The `paneTabs` under the title, for a modal with sections. */
  tabs?: Html
  body: ReadonlyArray<Html>
  /** The actions at the end of the footer, the one the modal exists for last, such as a `submit`. */
  footer?: ReadonlyArray<Html>
  /** Controls at the start of the footer, such as Back to the step before, or an action that opens another dialog. */
  leading?: ReadonlyArray<Html>
  /** Adds a quiet button that closes the modal, before the footer's actions, or at the start of the footer. */
  cancelLabel?: string
  /** Puts the `cancelLabel` button at the start of the footer, ahead of the `leading` controls, and not at its end. */
  isCancelLeading?: boolean
  /** Disables the `cancelLabel` button, for a form that cannot be left while its request is on its way. */
  isCancelDisabled?: boolean
  /** Makes the panel a form that sends this when submitted, so a `submit` in the footer sends it. */
  onSubmit?: Message
  /** `form` (the default) is 26rem, `wide` 32rem, and `compact` 35rem, each less than the window by a 1rem gutter. */
  width?: ModalWidth
}>

const renderHeader = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  config: ModalConfig<Message>
): Html =>
  h.div(
    [h.Class(headerBand)],
    [
      h.div(
        [h.Class(titleRow)],
        [
          h.div(
            [h.Class(titleBlock)],
            [
              h.h2([...render.title, h.Class(titleText)], [config.title]),
              config.context === undefined ? h.empty : h.span([h.Class(contextText)], [config.context])
            ]
          ),
          h.div([h.Class(closeSlot)], [iconButtonWith(h, render.closeButton, { icon: "mark-close", label: "Close" })])
        ]
      ),
      config.tabs === undefined ? h.empty : h.div([h.Class(tabsSlot)], [config.tabs])
    ]
  )

const renderFooter = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  config: ModalConfig<Message>
): Html => {
  if (config.footer === undefined && config.cancelLabel === undefined && config.leading === undefined) {
    return h.empty
  }

  const cancelAttributes =
    config.isCancelDisabled === true
      ? [h.Type("button"), h.AriaDisabled(true), h.DataAttribute("disabled", "")]
      : render.closeButton
  const cancel =
    config.cancelLabel === undefined ? [] : [buttonWith(h, cancelAttributes, config.cancelLabel, { variant: "quiet" })]
  const leading = [...(config.isCancelLeading === true ? cancel : []), ...(config.leading ?? [])]

  return h.div(
    [h.Class(footerRow)],
    [
      leading.length === 0 ? h.empty : h.div([h.Class(footerLeading)], leading),
      ...(config.isCancelLeading === true ? [] : cancel),
      ...(config.footer ?? [])
    ]
  )
}

/**
 * The `rows` to choose among, a `row` each, as a list named `label` that runs to the edges of the panel under
 * what comes before it in the body, and ends at the footer's line, so that a row's hover fills the panel's width.
 * It cancels the body's padding on the sides and below; the field before it keeps the body's gap.
 */
export const modalList = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  label: string,
  rows: ReadonlyArray<Html>
): Html =>
  h.ul(
    [h.AriaLabel(label), h.Class(listLook)],
    rows.map((row) => h.li([], [row]))
  )

/**
 * The dialog `render` describes, as a panel over a scrim while it is visible, and nothing while it is not: a
 * header of the `title`, the `context` after it, and a Close button, with the `tabs` under it; the `body`,
 * which scrolls, led by the `description`; and a footer of the `leading` controls at the start, and at the end a
 * quiet Cancel and the `footer`'s actions, or, with `isCancelLeading`, the Cancel at the start. A Cancel that
 * `isCancelDisabled` is dimmed and closes nothing. The panel is 26rem wide, 32rem for `wide`, or 35rem for `compact`,
 * and less than the window by a gutter.
 */
export const modal = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  render: ModalRender<Message, Requirements>,
  config: ModalConfig<Message>
): Html => {
  const panelAttributes = [...render.panel, h.Class(`${panelBase} ${panelWidths[config.width ?? "form"]}`)]
  const panelChildren = [
    renderHeader(h, render, config),
    h.div(
      [h.Class(bodyColumn)],
      [
        config.description === undefined
          ? h.empty
          : h.p([...render.description, h.Class(descriptionText)], [config.description]),
        ...config.body
      ]
    ),
    renderFooter(h, render, config)
  ]

  return h.dialog(
    [...render.dialog, h.Class(dialogLook)],
    render.isVisible
      ? [
          h.div([...render.backdrop, h.Class(backdropLook)]),
          config.onSubmit === undefined
            ? h.div(panelAttributes, panelChildren)
            : h.form([...panelAttributes, h.OnSubmit(config.onSubmit)], panelChildren)
        ]
      : []
  )
}
