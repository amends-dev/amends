/**
 * The pieces a form screen is made of beside its controls: the form itself, with its fields and its
 * button in a column, a line of text with a link in it, and a value with the link that changes it.
 */

import type { Html, HtmlBuilder } from "foldkit/html"

const formColumn = "mt-9 flex flex-col gap-4"

const inlineRow = "flex items-baseline gap-1 text-hint text-ink-secondary"

const valueRow = "mt-3 flex items-baseline justify-between gap-4 text-hint"

const valueText = "min-w-0 text-item text-ink wrap-anywhere"

/**
 * A form that sends `onSubmit`, its `children` in a column. A `label` names it, so assistive technology
 * finds it as a form.
 */
export const form = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ onSubmit: Message; label?: string }>,
  children: ReadonlyArray<Html>
): Html =>
  h.form(
    [
      h.OnSubmit(config.onSubmit),
      ...(config.label === undefined ? [] : [h.AriaLabel(config.label)]),
      h.Class(formColumn)
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
