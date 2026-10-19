/**
 * The controls the app's views share, over `@foldkit/ui`'s headless components: labelled inputs and
 * boxes, buttons, a choice of a member or of a list, a yes-or-no switch, why an entry was refused,
 * and that an action is on its way. Each renders with the caller's builder and messages.
 */

import type { Member } from "@amends-dev/core/workspace"
import * as Button from "@foldkit/ui/button"
import * as Checkbox from "@foldkit/ui/checkbox"
import * as Input from "@foldkit/ui/input"
import * as Select from "@foldkit/ui/select"
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

/** A labelled switch, on or off. */
export const toggle = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ id: string; label: string; isOn: boolean; onToggle: (isOn: boolean) => Message }>
) =>
  Checkbox.view(
    {
      id: config.id,
      isChecked: config.isOn,
      onToggle: config.onToggle,
      toView: (attributes) =>
        h.div([], [h.button(attributes.checkbox, [config.isOn ? "✓" : ""]), h.label(attributes.label, [config.label])])
    },
    h
  )

/** A choice of one of `members`, or none, as `none` reads. */
export const memberSelect = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    none: string
    members: ReadonlyArray<Member.Member>
    value: Option.Option<Member.Member["id"]>
    onChange: (memberId: Option.Option<Member.Member["id"]>) => Message
  }>
) =>
  Select.view(
    {
      id: config.id,
      value: Option.getOrElse(config.value, () => ""),
      onChange: (value) =>
        config.onChange(Option.fromUndefinedOr(config.members.find((member) => member.id === value)?.id)),
      toView: (attributes) =>
        h.div(
          [],
          [
            h.label(attributes.label, [config.label]),
            h.select(attributes.select, [
              h.option([h.Value("")], [config.none]),
              ...config.members.map((member) => h.option([h.Value(member.id)], [member.name]))
            ])
          ]
        )
    },
    h
  )

/** A choice of one of `choices`, each a value and how the person reads it. */
export const choiceSelect = <Choice extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    choices: ReadonlyArray<readonly [Choice, string]>
    value: Choice
    onChange: (value: Choice) => Message
  }>
) =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: (value) => config.onChange(config.choices.find(([choice]) => choice === value)?.[0] ?? config.value),
      toView: (attributes) =>
        h.div(
          [],
          [
            h.label(attributes.label, [config.label]),
            h.select(
              attributes.select,
              config.choices.map(([choice, label]) => h.option([h.Value(choice)], [label]))
            )
          ]
        )
    },
    h
  )
