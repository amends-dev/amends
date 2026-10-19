/**
 * The pieces a form screen is made of beside its controls: the form itself, with its fields and its
 * button in a column, a line of text with a link in it, a value with the link that changes it, and a
 * setting's row of what it is and the control that changes it.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const formColumn = "flex flex-col gap-4"

const screenSpacing = "mt-9"

const inlineRow = "flex items-baseline gap-1 text-hint text-ink-secondary"

const valueRow = "mt-3 flex items-baseline justify-between gap-4 text-hint"

const valueText = "min-w-0 text-item text-ink wrap-anywhere"

const settingRowLook = "flex flex-wrap items-start justify-between gap-x-4 gap-y-2"

const settingText = "flex min-w-48 flex-1 flex-col gap-0.5"

const settingLabel = "m-0 text-item font-medium wrap-anywhere text-ink"

const settingCopy = "m-0 text-hint text-ink-secondary"

const settingAction = "flex flex-none items-center"

/**
 * A form that sends `onSubmit`, its `children` in a column. A `label` names it, so assistive technology
 * finds it as a form. A `screen` form (the default) sits 36px below the text above it; a `pane` form, for
 * one inside a pane or a message, has no space above it.
 */
export const form = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ onSubmit: Message; label?: string; variant?: "screen" | "pane" }>,
  children: ReadonlyArray<Html>
): Html =>
  h.form(
    [
      h.OnSubmit(config.onSubmit),
      ...(config.label === undefined ? [] : [h.AriaLabel(config.label)]),
      h.Class(config.variant === "pane" ? formColumn : `${screenSpacing} ${formColumn}`)
    ],
    children
  )

/** Text and a link in a row, such as a question and the way to answer it. */
export const inline = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html | string>
): Html => h.p([h.Class(inlineRow)], children)

/** What the person entered, with the link that changes it at the right. */
export const valueWithAction = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  value: string,
  action: Html
): Html => h.div([h.Class(valueRow)], [h.span([h.Class(valueText)], [value]), action])

/**
 * One setting as a row: its `label` in medium weight over the `copy` that says what it is, in quiet text, and
 * the `action` at the right, any control that changes it. When they do not fit side by side, the action wraps to
 * a line of its own, at the start.
 */
export const settingRow = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; copy?: string; action?: Html | undefined }>
): Html =>
  h.div(
    [h.Class(settingRowLook)],
    [
      h.div(
        [h.Class(settingText)],
        [
          h.p([h.Class(settingLabel)], [config.label]),
          config.copy === undefined ? h.empty : h.p([h.Class(settingCopy)], [config.copy])
        ]
      ),
      config.action === undefined ? h.empty : h.div([h.Class(settingAction)], [config.action])
    ]
  )
