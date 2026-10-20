/**
 * The controls the app's views share, over `@foldkit/ui`'s headless components: buttons and the row
 * they lie in, a link to another page, labelled fields and boxes and the grid they lie in, a labelled
 * switch, a choice from a list, a six-digit code, a line of hint, what is being waited for, why an entry was refused, a boxed note for a page as a
 * whole, that an action is on its way, and the column that holds a few of these together. Each renders
 * with the caller's builder and messages, and carries the look.
 */

import * as Button from "@foldkit/ui/button"
import * as Input from "@foldkit/ui/input"
import * as Select from "@foldkit/ui/select"
import * as Switch from "@foldkit/ui/switch"
import * as Textarea from "@foldkit/ui/textarea"
import * as Option from "effect/Option"
import type { Attribute, ChildAttribute, Html, HtmlBuilder, KeyboardModifiers } from "foldkit/html"
import { type IconName, icon } from "./icon.ts"
import { statusMark } from "./mark.ts"

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

const linkLook = "text-ink underline underline-offset-2 focus-ring hover:text-ink-secondary"

const buttonRegularSizes = {
  primary: "min-h-9 px-4 text-control max-desktop:min-h-11",
  secondary: "min-h-9 px-4 text-control max-desktop:min-h-11",
  quiet: "min-h-8 px-2.5 text-hint max-desktop:min-h-11",
  link: ""
}

const buttonLargeSize = "min-h-11 px-5 text-item"

const buttonWide = "w-full"

const iconButtonBase =
  "inline-flex flex-none cursor-pointer items-center justify-center bg-transparent p-0 text-ink-secondary focus-ring hover:bg-subtle hover:text-ink aria-pressed:text-ink"

const hiddenLabel = "sr-only"

const iconButtonSizes = {
  regular: "size-8 max-desktop:size-11",
  compact: "size-6 max-desktop:size-11"
}

const buttonRowLook = "flex flex-wrap items-center gap-2"

const centeredLook = "justify-center"

const fieldColumn = "flex flex-col gap-2"

const columnLook = "flex flex-col gap-3"

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
  "group relative inline-flex h-5 w-9 flex-none cursor-pointer items-center border border-outline bg-subtle focus-ring data-checked:border-action data-checked:bg-action data-disabled:cursor-default data-disabled:opacity-50 max-desktop:after:absolute max-desktop:after:-inset-x-1.25 max-desktop:after:-inset-y-3.25"

const switchThumb =
  "block size-3.5 translate-x-0.5 bg-action transition-transform group-data-checked:translate-x-4.5 group-data-checked:bg-subtle motion-reduce:transition-none"

const switchLabel =
  "cursor-pointer text-item text-ink select-none max-desktop:flex max-desktop:min-h-11 max-desktop:items-center"

const switchLabelDisabled =
  "cursor-default text-item text-ink-disabled select-none max-desktop:flex max-desktop:min-h-11 max-desktop:items-center"

const noticeBase = "text-hint"

const noticeTones = {
  danger: "text-danger-text",
  caution: "text-caution-text",
  success: "text-success-text"
}

const noticeBoxLooks = {
  caution: "border-caution-border bg-caution-surface",
  danger: "border-danger-border bg-danger-surface",
  success: "border-success-border bg-success-surface"
}

const noticeBoxTitles = { caution: "text-caution-text", danger: "text-danger-text", success: "text-success-text" }

const noticeBoxMarks = { caution: "attention", danger: "blocked", success: "available" } as const

const noticeBoxBase = "flex items-start gap-3 border px-4 py-3"

const noticeBoxMark = "mt-1.5 flex-none"

const noticeBoxColumn = "flex min-w-0 flex-1 flex-col gap-1"

const noticeBoxTitle = "m-0 text-control font-medium"

const noticeBoxLines = "m-0 flex list-none flex-col gap-1 p-0 text-control text-ink-secondary"

const sendingMark = "text-meta text-ink-muted"

const hintText = "text-hint text-ink-muted"

const loadingText = "m-0 text-control text-ink-secondary"

const codeCells = "group relative grid grid-cols-6 gap-3 max-tablet:gap-2"

const codeCell =
  "grid h-14 place-items-center border border-outline bg-field text-[1.375rem] leading-[1.875rem] font-medium text-ink tabular-nums group-focus-within:data-next:border-outline-strong group-data-invalid:border-outline-danger group-data-invalid:group-focus-within:data-next:border-outline-danger group-data-disabled:bg-subtle group-data-disabled:text-ink-disabled"

const codeInputBox =
  "absolute inset-0 m-0 size-full border-0 bg-transparent p-0 text-body tracking-[2rem] text-transparent caret-transparent outline-none selection:bg-transparent focus-ring"

/** How many digits the sign-in code has. */
const codeLength = 6

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
  /** Drawn at `sm` before the label, 8px from it, and hidden from assistive technology, which reads the label. */
  icon?: IconName
  isDisabled?: boolean
  /**
   * What assistive technology calls the button when its label alone does not tell it from the buttons around it, such as
   * "Revoke invitation for casey@mercier.example" for "Revoke". It begins with the label.
   */
  name?: string
}>

export type IconButtonOptions = Readonly<{
  /** `compact` is 24px, for the actions along a list's heading, and the default 32px. Both are 44px on touch. */
  size?: "compact"
  /**
   * For a button that switches something on or off: whether it is on now, which it says as `aria-pressed` and
   * shows in `ink`. A button without it is not a switch.
   */
  isPressed?: boolean
}>

/**
 * A group of attributes a headless component publishes, which a view hands a control to spread onto its
 * element: the `initialFocus` of a dialog, on the control that takes focus when the dialog opens.
 */
export type PublishedAttributes = ReadonlyArray<ChildAttribute>

/**
 * The attributes a control takes: the caller's own, such as `answerKeys`, or a mount its Block registers, and the
 * group a headless component publishes.
 */
export type ControlAttributes<Message, Requirements = never> = ReadonlyArray<
  Attribute<Message, Requirements> | ChildAttribute
>

/**
 * What a choice says besides its label: a `description`, which a native select can show only after the label, and
 * whether it can be chosen, for one that is listed to say that it can't be.
 */
export type ChoiceDetail = Readonly<{ description?: string; isDisabled?: boolean }>

/** A choice of a select: its value, how the person reads it, and what else it says. */
export type Choice<Value extends string> = readonly [Value, string] | readonly [Value, string, ChoiceDetail]

export type ChoiceSelectOptions = Readonly<{
  /** The label names the select for assistive technology and is not shown, for a select in a row of its own. */
  isLabelHidden?: boolean
}>

export type NoticeTone = keyof typeof noticeTones

export type NoticeBoxTone = keyof typeof noticeBoxLooks

export type NoticeOptions = Readonly<{
  /** `danger` (the default) says what went wrong. */
  tone?: NoticeTone
}>

const joinClasses = (...classes: ReadonlyArray<string | false>): string => classes.filter(Boolean).join(" ")

const hasModifier = ({ shiftKey, ctrlKey, altKey, metaKey }: KeyboardModifiers) =>
  shiftKey || ctrlKey || altKey || metaKey

/**
 * A key handler for a text control above a list that its keys walk: `onKeyDown` says what a key sends, and a
 * key it answers does not do what the browser does for it, such as adding a line or moving the caret. A key it
 * does not answer is left to the browser, as is any key pressed with Shift, Control, Alt, or Meta.
 */
export const answerKeys = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  onKeyDown: (key: string) => Option.Option<Message>
) => h.OnKeyDownPreventDefault((key, modifiers) => (hasModifier(modifiers) ? Option.none() : onKeyDown(key)))

/**
 * A button in the look of `button` over `attributes` that already give it its behavior, such as the group a
 * headless dialog publishes for the control that closes it. Whether it is disabled is for those attributes to say.
 */
export const buttonWith = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  attributes: ControlAttributes<Message>,
  label: string,
  options: Omit<ButtonOptions, "isDisabled" | "name"> = {}
) => {
  const variant = options.variant ?? "secondary"
  const className = joinClasses(
    buttonBase,
    buttonLooks[variant],
    options.size === "large" && variant !== "link" ? buttonLargeSize : buttonRegularSizes[variant],
    options.wide === true && buttonWide
  )

  return h.button(
    [...attributes, h.Class(className)],
    options.icon === undefined ? [label] : [icon(h, options.icon, { size: "sm" }), label]
  )
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
      toView: (attributes) =>
        buttonWith(
          h,
          options.name === undefined ? attributes.button : [...attributes.button, h.AriaLabel(options.name)],
          label,
          { variant: defaultVariant, ...options }
        )
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
 * A link to `href` in the look of a `link` button, underlined text in `ink` at the size of the line around it, for
 * a page elsewhere, such as an integration's documentation. It opens in a new tab and sends the page it was
 * opened from nothing.
 */
export const link = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ label: string; href: string }>
): Html => h.a([h.Href(config.href), h.Target("_blank"), h.Rel("noreferrer"), h.Class(linkLook)], [config.label])

/**
 * A button of one icon in the look of `iconButton`, named by `label`, over `attributes` that already give it its
 * behavior, such as the group a headless dialog publishes for the control that closes it.
 */
export const iconButtonWith = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  attributes: ControlAttributes<Message>,
  config: Readonly<{ icon: IconName; label: string }>,
  options: IconButtonOptions = {}
) =>
  h.button(
    [
      ...attributes,
      ...(options.isPressed === undefined ? [] : [h.AriaPressed(options.isPressed ? "true" : "false")]),
      h.Class(joinClasses(iconButtonBase, iconButtonSizes[options.size ?? "regular"]))
    ],
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

/**
 * A quiet square button of one icon, named by `label`, that sends `onClick`. Given `isPressed` it is a switch,
 * and the caller draws the icon for the state it is in.
 */
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

export type ButtonRowOptions = Readonly<{
  /** Put the controls in the middle of the row's width, for what ends a list, such as a quiet Show older. */
  isCentered?: boolean
}>

/** Controls side by side, 8px apart, wrapping onto a new line when they do not fit. */
export const buttonRow = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>,
  options: ButtonRowOptions = {}
): Html => h.div([h.Class(joinClasses(buttonRowLook, options.isCentered === true && centeredLook))], children)

/** A few pieces that belong together inside a section, one under another, 12px apart, such as a notice and its button. */
export const column = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  children: ReadonlyArray<Html>
): Html => h.div([h.Class(columnLook)], children)

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

/**
 * A note boxed in its tone, `caution` (the default), `danger`, or `success`, for a page or a form as a whole and not
 * for one field: the tone's shape, the `title` that says what is wrong, or what was found, in medium weight, and
 * under it a quiet line for each of `lines`, why. It is a `note` named by its title, not an alert, since it is there
 * when the page opens.
 */
export const noticeBox = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{ title: string; lines: ReadonlyArray<string>; tone?: NoticeBoxTone }>
): Html => {
  const tone = config.tone ?? "caution"

  return h.div(
    [h.Role("note"), h.AriaLabel(config.title), h.Class(`${noticeBoxBase} ${noticeBoxLooks[tone]}`)],
    [
      h.span([h.Class(noticeBoxMark)], [statusMark(h, { kind: noticeBoxMarks[tone], label: config.title })]),
      h.div(
        [h.Class(noticeBoxColumn)],
        [
          h.p([h.Class(`${noticeBoxTitle} ${noticeBoxTitles[tone]}`)], [config.title]),
          config.lines.length === 0
            ? h.empty
            : h.ul(
                [h.Class(noticeBoxLines)],
                config.lines.map((line) => h.li([], [line]))
              )
        ]
      )
    ]
  )
}

/** A line of quiet text, such as what to know about the control above or below it. */
export const hint = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Class(hintText)], [text])

/**
 * A quiet line that says what a pane or a page is waiting for, such as "Loading your inbox…", in a live region, a
 * `status`, so that it is announced.
 */
export const loadingLine = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, text: string): Html =>
  h.p([h.Role("status"), h.Class(loadingText)], [text])

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
 * dialog's `initialFocus`, which a field in a dialog takes with `isAutofocus` off, and the keys the caller
 * answers, `answerKeys`, for a field above a list its keys walk. A field that `isDisabled` shows its value and
 * takes none, for a page the person may read and not change.
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
    isDisabled?: boolean
    isLabelHidden?: boolean
    attributes?: ControlAttributes<Message, Requirements>
  }>,
  error: Option.Option<string>
) =>
  Input.view(
    {
      id: config.id,
      type: config.type,
      value: config.value,
      onInput: config.onInput,
      isDisabled: config.isDisabled ?? false,
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

const digitsOf = (text: string): string => text.replaceAll(/\D/g, "").slice(0, codeLength)

/**
 * A labelled six-digit code in one native input, drawn as six cells of 56px, 12px apart (8px on phones) across
 * the column. Typing, pasting, deleting, and the platform's one-time-code autofill work as in a text field: what
 * `onInput` is given is digits only, at most six, so the caller keeps what it is given and the field shows it. The
 * cell the next digit goes into is outlined while the input has focus, and `error` outlines every cell in the
 * danger color, as it describes the input under them, with the `hint`, as `field` does. When the sixth digit is in,
 * `onComplete` is sent with the code in place of `onInput`, so that the caller can verify at once. The input is
 * focused as it shows unless `isAutofocus` says otherwise. The cells are hidden from assistive technology, which
 * reads the input and its label.
 */
export const codeInput = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    value: string
    hint?: string
    onInput: (code: string) => Message
    onComplete?: (code: string) => Message
    isAutofocus?: boolean
    isDisabled?: boolean
  }>,
  error: Option.Option<string>
) => {
  const digits = Array.from(digitsOf(config.value))
  const nextCell = Math.min(digits.length, codeLength - 1)

  return Input.view(
    {
      id: config.id,
      type: "text",
      value: config.value,
      onInput: (typed) => {
        const code = digitsOf(typed)
        return code.length === codeLength && config.onComplete !== undefined
          ? config.onComplete(code)
          : config.onInput(code)
      },
      isDisabled: config.isDisabled ?? false,
      isInvalid: Option.isSome(error),
      hasDescription: Option.isSome(error) || config.hint !== undefined,
      isAutofocus: config.isAutofocus ?? true,
      toView: (attributes) =>
        h.div(
          [h.Class(fieldColumn)],
          [
            h.label([...attributes.label, h.Class(fieldLabel)], [config.label]),
            h.div(
              [
                h.Class(codeCells),
                ...(Option.isSome(error) ? [h.DataAttribute("invalid", "")] : []),
                ...(config.isDisabled === true ? [h.DataAttribute("disabled", "")] : [])
              ],
              [
                ...Array.from({ length: codeLength }, (_, index) =>
                  h.span(
                    [
                      h.AriaHidden(true),
                      ...(index === nextCell ? [h.DataAttribute("next", "")] : []),
                      h.Class(codeCell)
                    ],
                    [digits[index] ?? ""]
                  )
                ),
                h.input([
                  ...attributes.input,
                  h.InputMode("numeric"),
                  h.Autocomplete("one-time-code"),
                  h.Spellcheck(false),
                  h.Class(codeInputBox)
                ])
              ]
            ),
            ...describeField(h, attributes.description, config.hint, error)
          ]
        )
    },
    h
  )
}

/**
 * A labelled box for longer text, `rows` lines tall, three unless given, with the `hint` under it and why its
 * value was refused, `error`, as a field has them. The `attributes` go onto the box.
 */
export const textarea = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    value: string
    onInput: (value: string) => Message
    rows?: number
    hint?: string
    error?: Option.Option<string>
    isDisabled?: boolean
    attributes?: PublishedAttributes
  }>
) => {
  const error = config.error ?? Option.none()

  return Textarea.view(
    {
      id: config.id,
      value: config.value,
      rows: config.rows ?? 3,
      onInput: config.onInput,
      isDisabled: config.isDisabled ?? false,
      isInvalid: Option.isSome(error),
      hasDescription: Option.isSome(error) || config.hint !== undefined,
      toView: (attributes) =>
        h.div(
          [h.Class(fieldColumn)],
          [
            h.label([...attributes.label, h.Class(fieldLabel)], [config.label]),
            h.textarea([...attributes.textarea, ...(config.attributes ?? []), h.Class(textareaBox)]),
            ...describeField(h, attributes.description, config.hint, error)
          ]
        )
    },
    h
  )
}

/**
 * A labelled switch, on or off, with its label after it. A switch that `isDisabled` shows how it is set and takes
 * no click or key, for a page the person may read and not change.
 */
export const toggle = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    isOn: boolean
    onToggle: (isOn: boolean) => Message
    isDisabled?: boolean
  }>
) =>
  Switch.view(
    {
      id: config.id,
      isChecked: config.isOn,
      onToggle: config.onToggle,
      isDisabled: config.isDisabled ?? false,
      toView: (attributes) =>
        h.div(
          [h.Class(switchRow)],
          [
            h.button([...attributes.button, h.Class(switchTrack)], [h.span([h.Class(switchThumb)])]),
            h.span(
              [...attributes.label, h.Class(config.isDisabled === true ? switchLabelDisabled : switchLabel)],
              [config.label]
            )
          ]
        )
    },
    h
  )

const detailOf = <Value extends string>(choice: Choice<Value>): ChoiceDetail | undefined =>
  choice.length === 3 ? choice[2] : undefined

/** How a choice reads in the list: its label, and its description after it. */
const choiceText = <Value extends string>(choice: Choice<Value>): string => {
  const description = detailOf(choice)?.description
  return description === undefined ? choice[1] : `${choice[1]} · ${description}`
}

/**
 * A choice of one of `choices`, each a value and how the person reads it, with a third part, a `ChoiceDetail`, for
 * a description after the label and for a choice that can't be chosen. With `isLabelHidden` the label does not
 * show above the select, and still names it. The `hint` is under it and `error` is why its value was refused, as a
 * field has them. The `attributes` go onto the select.
 */
export const choiceSelect = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    id: string
    label: string
    choices: ReadonlyArray<Choice<Value>>
    value: Value
    onChange: (value: Value) => Message
    hint?: string
    error?: Option.Option<string>
    isDisabled?: boolean
    attributes?: PublishedAttributes
  }>,
  options: ChoiceSelectOptions = {}
) => {
  const error = config.error ?? Option.none()

  return Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: (value) => config.onChange(config.choices.find(([choice]) => choice === value)?.[0] ?? config.value),
      isDisabled: config.isDisabled ?? false,
      isInvalid: Option.isSome(error),
      hasDescription: Option.isSome(error) || config.hint !== undefined,
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
                  config.choices.map((choice) =>
                    h.option(
                      [h.Value(choice[0]), ...(detailOf(choice)?.isDisabled === true ? [h.Disabled(true)] : [])],
                      [choiceText(choice)]
                    )
                  )
                )
              ]
            ),
            ...describeField(h, attributes.description, config.hint, error)
          ]
        )
    },
    h
  )
}
