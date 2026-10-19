/**
 * The controls the app's views share, over `@foldkit/ui`'s headless components: labelled inputs and
 * boxes, buttons, why an entry was refused, and that an action is on its way. Each renders with the
 * caller's builder and messages.
 */

import * as Button from "@foldkit/ui/button"
import * as Input from "@foldkit/ui/input"
import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"

/** Why what the person entered was refused, as an alert, when it was. */
export const errorView = <Message, Requirements>(
  error: Option.Option<string>,
  h: HtmlBuilder<Message, Requirements>
): Html => Option.match(error, { onNone: () => h.empty, onSome: (text) => h.p([h.Role("alert")], [text]) })

/** A labelled input, focused as it shows, with why its value was refused, if it was. */
export const field = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ id: string; label: string; type: string; value: string; onInput: (value: string) => Message }>,
  error: Option.Option<string>
) =>
  Input.view(
    {
      id: config.id,
      type: config.type,
      value: config.value,
      onInput: config.onInput,
      isInvalid: Option.isSome(error),
      isAutofocus: true,
      toView: (attributes) =>
        h.div([], [h.label(attributes.label, [config.label]), h.input(attributes.input), errorView(error, h)])
    },
    h
  )

/** The button that sends its form. */
export const submit = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, label: string) =>
  Button.view({ type: "submit", toView: (attributes) => h.button(attributes.button, [label]) }, h)

/** A labelled box for longer text. */
export const textarea = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ id: string; label: string; value: string; onInput: (value: string) => Message }>
) =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: 3,
      onInput: config.onInput,
      toView: (attributes) => h.div([], [h.label(attributes.label, [config.label]), h.textarea(attributes.textarea)])
    },
    h
  )

/** That what the person did is on its way to the server, while it is. */
export const sending = <Message, Requirements>(pending: boolean, h: HtmlBuilder<Message, Requirements>): Html =>
  pending ? h.span([], [" · Sending…"]) : h.empty

/** A button that sends `onClick`. */
export const button = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, label: string, onClick: Message) =>
  Button.view({ onClick, toView: (attributes) => h.button(attributes.button, [label]) }, h)
