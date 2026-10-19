/**
 * The controls the app's views share, over `@foldkit/ui`'s headless components: buttons and the row
 * they lie in, labelled fields and boxes and the grid they lie in, a labelled switch, a choice from a
 * list, a line of hint, why an entry was refused, and that an action is on its way. Each renders with
 * the caller's builder and messages, and carries the look.
 */

import * as Button from "@foldkit/ui/button"
import * as Input from "@foldkit/ui/input"
import * as Select from "@foldkit/ui/select"
import * as Switch from "@foldkit/ui/switch"
import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"

const buttonBase =
  "inline-flex flex-none cursor-pointer items-center justify-center gap-2 whitespace-nowrap focus-ring aria-disabled:cursor-default"

const buttonLooks = {
  primary:
    "border border-transparent bg-action font-medium text-on-action not-aria-disabled:hover:opacity-88 aria-disabled:bg-subtle aria-disabled:text-ink-disabled",
  secondary:
    "border border-outline bg-action-secondary font-medium text-ink not-aria-disabled:hover:border-outline-strong aria-disabled:border-transparent aria-disabled:bg-subtle aria-disabled:text-ink-disabled",
  quiet:
    "border border-transparent bg-transparent font-normal text-ink-secondary not-aria-disabled:hover:bg-subtle not-aria-disabled:hover:text-ink aria-disabled:text-ink-disabled",
  link: "bg-transparent text-ink underline underline-offset-2 not-aria-disabled:hover:text-ink-secondary aria-disabled:text-ink-disabled"
}

const buttonRegularSizes = {
  primary: "min-h-9 px-4 text-control max-desktop:min-h-11",
  secondary: "min-h-9 px-4 text-control max-desktop:min-h-11",
  quiet: "min-h-8 px-2.5 text-hint max-desktop:min-h-11",
  link: ""
}

const buttonLargeSize = "min-h-11 px-5 text-item"

const buttonWide = "w-full"

const iconButtonBase =
  "inline-flex flex-none cursor-pointer items-center justify-center bg-transparent p-0 text-ink-secondary focus-ring hover:bg-subtle hover:text-ink"

const hiddenLabel = "sr-only"

const iconButtonSizes = {
  regular: "size-8 max-desktop:size-11",
  compact: "size-6 max-desktop:size-11"
}

const buttonRowLook = "flex flex-wrap items-center gap-2"

const fieldColumn = "flex flex-col gap-2"

const fieldGridLook = "grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"

const fieldLabel = "block p-0 text-item font-medium text-ink"

const fieldErrorSpacing = "mt-1"

const controlBox =
  "block w-full min-h-10.5 border border-outline bg-field text-body text-ink focus-ring focus:not-aria-invalid:border-outline-strong aria-invalid:border-outline-danger max-desktop:min-h-11 max-tablet:text-body-touch"

const inputBox = `${controlBox} px-3 placeholder:text-ink-muted`

const textareaBox = `${inputBox} resize-none py-2.5`

const selectBox = `${controlBox} cursor-pointer appearance-none ps-3 pe-10`

const selectChevron = "chevron-down"

const switchRow = "flex items-center gap-3 max-desktop:min-h-11"

const switchTrack =
  "group relative inline-flex h-5 w-9 flex-none cursor-pointer items-center border border-outline bg-subtle focus-ring data-checked:border-action data-checked:bg-action max-desktop:after:absolute max-desktop:after:-inset-x-1.25 max-desktop:after:-inset-y-3.25"

const switchThumb =
  "block size-3.5 translate-x-0.5 bg-action transition-transform group-data-checked:translate-x-4.5 group-data-checked:bg-subtle motion-reduce:transition-none"

const switchLabel =
  "cursor-pointer text-item text-ink select-none max-desktop:flex max-desktop:min-h-11 max-desktop:items-center"

const noticeBase = "text-hint"

const noticeTones = {
  danger: "text-danger-text",
  caution: "text-caution-text",
  success: "text-success-text"
}

const sendingMark = "text-meta text-ink-muted"

const hintText = "text-hint text-ink-muted"

export type ButtonVariant = keyof typeof buttonLooks

export type ButtonOptions = Readonly<{
  /**
   * Filled for the action a form exists for, `secondary` (the default) beside it, `quiet` for a row's, and
   * `link` for underlined text in a sentence, at the size around it.
   */
  variant?: ButtonVariant
  /** `large` is 44px, for the centered screens. A `link` is as tall as its line. */
  size?: "large"
  /** Fill the container's width. */
  wide?: boolean
  isDisabled?: boolean
}>

export type IconButtonOptions = Readonly<{
  /** `compact` is 24px, for the actions along a list's heading, and the default 32px. Both are 44px on touch. */
  size?: "compact"
}>

/**
 * A group of attributes a headless component publishes, which a view hands a control to spread onto its
 * element: the `initialFocus` of a dialog, on the control that takes focus when the dialog opens.
 */
export type PublishedAttributes = ReadonlyArray<ChildAttribute>

/** The attributes a button takes: its own, and the group a headless component publishes. */
export type ButtonAttributes<Message> = ReadonlyArray<Attribute<Message> | ChildAttribute>

export type ChoiceSelectOptions = Readonly<{
  /** The label names the select for assistive technology and is not shown, for a select in a row of its own. */
  isLabelHidden?: boolean
}>

export type NoticeTone = keyof typeof noticeTones

export type NoticeOptions = Readonly<{
  /** `danger` (the default) says what went wrong. */
  tone?: NoticeTone
}>

const joinClasses = (...classes: ReadonlyArray<string | false>): string => classes.filter(Boolean).join(" ")

/**
 * A button in the look of `button` over `attributes` that already give it its behavior, such as the group a
 * headless dialog publishes for the control that closes it. Whether it is disabled is for those attributes to say.
 */
export const buttonWith = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  attributes: ButtonAttributes<Message>,
  label: string,
  options: Omit<ButtonOptions, "isDisabled"> = {}
) => {
  const variant = options.variant ?? "secondary"
  const className = joinClasses(
    buttonBase,
    buttonLooks[variant],
    options.size === "large" && variant !== "link" ? buttonLargeSize : buttonRegularSizes[variant],
    options.wide === true && buttonWide
  )

  return h.button([...attributes, h.Class(className)], [label])
}

const renderButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  label: string,
  behavior: Readonly<{ type: "button" | "submit"; onClick?: Message }>,
  options: ButtonOptions,
  defaultVariant: ButtonVariant
) =>
  Button.view(
    {
      ...behavior,
      isDisabled: options.isDisabled ?? false,
      toView: (attributes) => buttonWith(h, attributes.button, label, { variant: defaultVariant, ...options })
    },
    h
  )

/** A button that sends `onClick`. */
export const button = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  label: string,
  onClick: Message,
  options: ButtonOptions = {}
) => renderButton(h, label, { type: "button", onClick }, options, "secondary")

/** The button that sends its form, filled unless the options say otherwise. */
export const submit = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  label: string,
  options: ButtonOptions = {}
) => renderButton(h, label, { type: "submit" }, options, "primary")

/**
 * A button of one icon in the look of `iconButton`, named by `label`, over `attributes` that already give it its
 * behavior, such as the group a headless dialog publishes for the control that closes it.
 */
export const iconButtonWith = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  attributes: ButtonAttributes<Message>,
  config: Readonly<{ icon: IconName; label: string }>,
  options: IconButtonOptions = {}
) =>
  h.button(
    [...attributes, h.Class(joinClasses(iconButtonBase, iconButtonSizes[options.size ?? "regular"]))],
    [icon(h, config.icon, { size: "sm" }), h.span([h.Class(hiddenLabel)], [config.label])]
  )

const renderIconButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ icon: IconName; label: string }>,
  behavior: Readonly<{ type: "button" | "submit"; onClick?: Message }>,
  options: IconButtonOptions
) =>
  Button.view(
    {
      ...behavior,
      toView: (attributes) => iconButtonWith(h, attributes.button, config, options)
    },
    h
  )

/** A quiet square button of one icon, named by `label`, that sends `onClick`. */
export const iconButton = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ icon: IconName; label: string; onClick: Message }>,
  options: IconButtonOptions = {}
) => renderIconButton(h, config, { type: "button", onClick: config.onClick }, options)

/** The button of one icon, named by `label`, that sends its form, in the look of `iconButton`. */
export const iconSubmit = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ icon: IconName; label: string }>,
  options: IconButtonOptions = {}
) => renderIconButton(h, config, { type: "submit" }, options)

/** Controls side by side, 8px apart, wrapping onto a new line when they do not fit. */
export const buttonRow = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(buttonRowLook)], children)

/** Fields side by side in columns at least 9rem wide, 12px apart, wrapping onto new rows when they do not fit. */
export const fieldGrid = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(fieldGridLook)], children)

/** Why what the person entered was refused, or what to know about it, as an alert, when there is one. */
export const notice = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  message: Option.Option<string>,
  options: NoticeOptions = {}
): Html =>
  Option.match(message, {
    onNone: () => h.empty,
    onSome: (text) =>
      h.p([h.Role("alert"), h.Class(joinClasses(noticeBase, noticeTones[options.tone ?? "danger"]))], [text])
  })

/** A line of quiet text, such as what to know about the control above or below it. */
export const hint = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(hintText)], [text])

/** That what the person did is on its way to the server, while it is. */
export const sending = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, pending: boolean): Html =>
  pending ? h.span([h.Class(sendingMark)], [" · Sending…"]) : h.empty

/** What follows an input: why its value was refused, then what to know about it. The refusal describes the input, and the hint does while there is none. */
const describeField = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  descriptionAttributes: ReadonlyArray<Attribute<Message>>,
  text: string | undefined,
  error: Option.Option<string>
): ReadonlyArray<Html> => [
  Option.isNone(error) ? h.empty : h.div([...descriptionAttributes, h.Class(fieldErrorSpacing)], [notice(h, error)]),
  text === undefined
    ? h.empty
    : h.p([...(Option.isNone(error) ? descriptionAttributes : []), h.Class(hintText)], [text])
]

/**
 * A labelled input, focused as it shows unless `isAutofocus` says otherwise, with why its value was refused, if
 * it was. The `placeholder` shows an example of what to enter while it is empty, and the `hint` is a line of what
 * to know about the input, 8px under it. With `isLabelHidden` the label does not show above the input and still
 * names it, for a field in a section that already names it. The `attributes` go onto the input, such as a
 * dialog's `initialFocus`, which a field in a dialog takes with `isAutofocus` off.
 */
export const field = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    type: string
    value: string
    onInput: (value: string) => Message
    placeholder?: string
    hint?: string
    isAutofocus?: boolean
    isLabelHidden?: boolean
    attributes?: PublishedAttributes
  }>,
  error: Option.Option<string>
) =>
  Input.view(
    {
      id: config.id,
      type: config.type,
      value: config.value,
      onInput: config.onInput,
      isInvalid: Option.isSome(error),
      hasDescription: Option.isSome(error) || config.hint !== undefined,
      isAutofocus: config.isAutofocus ?? true,
      toView: (attributes) =>
        h.div(
          [h.Class(fieldColumn)],
          [
            h.label(
              [...attributes.label, h.Class(config.isLabelHidden === true ? hiddenLabel : fieldLabel)],
              [config.label]
            ),
            h.input([
              ...attributes.input,
              ...(config.attributes ?? []),
              ...(config.placeholder === undefined ? [] : [h.Placeholder(config.placeholder)]),
              h.Class(inputBox)
            ]),
            ...describeField(h, attributes.description, config.hint, error)
          ]
        )
    },
    h
  )

/** A labelled box for longer text, `rows` lines tall, three unless given. The `attributes` go onto the box. */
export const textarea = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    value: string
    onInput: (value: string) => Message
    rows?: number
    attributes?: PublishedAttributes
  }>
) =>
  Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: config.rows ?? 3,
      onInput: config.onInput,
      toView: (attributes) =>
        h.div(
          [h.Class(fieldColumn)],
          [
            h.label([...attributes.label, h.Class(fieldLabel)], [config.label]),
            h.textarea([...attributes.textarea, ...(config.attributes ?? []), h.Class(textareaBox)])
          ]
        )
    },
    h
  )

/** A labelled switch, on or off, with its label after it. */
export const toggle = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ id: string; label: string; isOn: boolean; onToggle: (isOn: boolean) => Message }>
) =>
  Switch.view(
    {
      id: config.id,
      isChecked: config.isOn,
      onToggle: config.onToggle,
      toView: (attributes) =>
        h.div(
          [h.Class(switchRow)],
          [
            h.button([...attributes.button, h.Class(switchTrack)], [h.span([h.Class(switchThumb)])]),
            h.span([...attributes.label, h.Class(switchLabel)], [config.label])
          ]
        )
    },
    h
  )

/**
 * A choice of one of `choices`, each a value and how the person reads it. With `isLabelHidden` the label does not
 * show above the select, and still names it. The `attributes` go onto the select.
 */
export const choiceSelect = <Choice extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    choices: ReadonlyArray<readonly [Choice, string]>
    value: Choice
    onChange: (value: Choice) => Message
    attributes?: PublishedAttributes
  }>,
  options: ChoiceSelectOptions = {}
) =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: (value) => config.onChange(config.choices.find(([choice]) => choice === value)?.[0] ?? config.value),
      toView: (attributes) =>
        h.div(
          [h.Class(fieldColumn)],
          [
            h.label(
              [...attributes.label, h.Class(options.isLabelHidden === true ? hiddenLabel : fieldLabel)],
              [config.label]
            ),
            h.div(
              [h.Class(selectChevron)],
              [
                h.select(
                  [...attributes.select, ...(config.attributes ?? []), h.Class(selectBox)],
                  config.choices.map(([choice, label]) => h.option([h.Value(choice)], [label]))
                )
              ]
            )
          ]
        )
    },
    h
  )
