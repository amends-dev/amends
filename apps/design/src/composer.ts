/**
 * Where the person writes a message: a box that grows with what they type, with the button that sends it.
 */

import * as Textarea from "@foldkit/ui/textarea"
import type { HtmlBuilder } from "foldkit/html"
import { iconSubmit } from "./control.ts"

const composerBox = "flex flex-col border border-outline bg-field focus-within:border-outline-strong"

const composerLabel = "sr-only"

const composerText =
  "block max-h-60 min-h-10 w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-body text-ink outline-none field-sizing-content placeholder:text-ink-muted max-tablet:text-body-touch"

const composerActions = "flex flex-none items-center justify-end px-1.5 pb-1.5"

/**
 * A form named by `label`: a bordered box holding the textarea for `id`, whose label is read by assistive
 * technology and not shown, and whose `placeholder` shows while it is empty, then the button named
 * `submitLabel` that sends `onSubmit`. The box is between 2.5rem and 15rem tall, and the border darkens
 * while the person writes in it. The button submits the form; Enter adds a line.
 */
export const composer = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    placeholder: string
    value: string
    onInput: (value: string) => Message
    onSubmit: Message
    submitLabel: string
  }>
) => {
  const labelId = `${config.id}-label`

  return h.form(
    [h.AriaLabelledBy(labelId), h.OnSubmit(config.onSubmit), h.Class(composerBox)],
    [
      Textarea.view(
        {
          id: config.id,
          value: config.value,
          rows: 1,
          placeholder: config.placeholder,
          onInput: config.onInput,
          toView: (attributes) =>
            h.div(
              [],
              [
                h.label([...attributes.label, h.Id(labelId), h.Class(composerLabel)], [config.label]),
                h.textarea([...attributes.textarea, h.Class(composerText)])
              ]
            )
        },
        h
      ),
      h.div([h.Class(composerActions)], [iconSubmit(h, { icon: "mark-send", label: config.submitLabel })])
    ]
  )
}
