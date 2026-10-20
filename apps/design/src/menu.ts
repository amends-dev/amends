/**
 * The menu: a button that opens a floating list of choices and actions, such as a filter above a list or the
 * account at the foot of the rail. It is the look of `@foldkit/ui`'s headless menu, so the framework keeps the
 * button's keys, the list's arrow keys and typeahead, Escape, a click outside, and the focus that returns to
 * the button, and this module gives them the look.
 *
 * A Block that has a menu:
 *
 * - creates the menu's Block once, `Menu.create<Value>()`, with `Value` the choices' values, and binds it as a
 *   child, with an `id` for the menu through `init`;
 * - folds the Block's `Selected` out message into whatever the choice was for;
 * - renders the menu with `menu` or `choiceMenu`, whose `embed` embeds the bound Block with the view inputs the
 *   design builds: `(viewInputs) => h.block(MenuBinding.embedView({ slotId, model: model.menu, viewInputs }))`.
 */

import type { AnchorConfig, ViewInputs } from "@foldkit/ui/menu"
import type { Html, HtmlBuilder } from "foldkit/html"
import { buttonClass, buttonContent } from "./control.ts"
import { icon } from "./icon.ts"

const wrapperLook = "inline-flex flex-none"

const plainTriggerLook = "inline-flex cursor-pointer items-center bg-transparent p-0 focus-ring"

const panelLook =
  "z-40 max-h-96 min-w-48 overflow-y-auto border border-outline bg-popover p-1 text-ink shadow-popover outline-none"

const backdropLook = "fixed inset-0 z-20"

const itemLook =
  "flex min-h-8 cursor-pointer items-center gap-2 px-2 text-control text-ink data-active:bg-subtle data-disabled:cursor-default data-disabled:text-ink-disabled max-desktop:min-h-11"

const itemContent = "flex min-w-0 flex-1 items-center gap-2"

const itemLabel = "min-w-0 flex-1"

const itemCheck = "flex flex-none"

const hiddenState = "sr-only"

const separatorLook = "-mx-1 my-1 h-px border-0 bg-divider"

const groupLabelLook = "block px-2 pt-1.5 pb-1 text-hint font-medium text-ink-secondary"

const headerColumn = "flex min-w-0 flex-col gap-0.5 px-2.5 pt-2 pb-2.5"

const headerTitle = "truncate text-control font-medium text-ink"

const headerDetail = "truncate text-hint text-ink-secondary"

/** The gap between the button and the list, in pixels, and the room the list keeps from the window's edges. */
const anchorGap = 6

const anchorPadding = 8

/** Where the list opens from its button. */
export type MenuPlacement = NonNullable<AnchorConfig["placement"]>

/**
 * One line of the menu, which `Selected` reports by its `value`. A choice with an `isChecked` is one of a group of
 * which one is current, and shows a check mark while it is `true`; a choice without it is an action.
 */
export type MenuChoice<Value extends string> = Readonly<{
  /** What the Block reports when it is chosen. Each choice of a menu has a value of its own. */
  value: Value
  label: string
  isChecked?: boolean
}>

/** Choices with a heading above them, such as Appearance over System, Light, and Dark. */
export type MenuGroup<Value extends string> = Readonly<{
  label?: string
  choices: ReadonlyArray<MenuChoice<Value>>
}>

/**
 * The button that opens the menu: `choice`, the default, shows `text` with a chevron, the current choice of a
 * filter, and `plain` wraps `content` such as a person's mark. The `name` is what assistive technology calls the
 * button when its text does not say enough, such as "Sort: Latest activity", and one that has no text must have it.
 */
export type MenuTrigger =
  | Readonly<{ variant?: "choice"; text: string; name?: string }>
  | Readonly<{ variant: "plain"; name: string; content: Html }>

export type MenuConfig<Value extends string> = Readonly<{
  trigger: MenuTrigger
  /** `bottom-start` unless given. */
  placement?: MenuPlacement
  /** Who or what the menu is about, a title over a detail, at the top. */
  header?: Readonly<{ title: string; detail?: string }>
  /** Separated by a line. */
  groups: ReadonlyArray<MenuGroup<Value>>
  /** Embeds the bound Block with the view inputs the design built. */
  embed: (viewInputs: ViewInputs<Value>) => Html
}>

/** The choices of `groups` in order, each with the number of its group. */
const flattenGroups = <Value extends string>(groups: ReadonlyArray<MenuGroup<Value>>) =>
  groups.flatMap((group, groupIndex) => group.choices.map((choice) => ({ choice, groupKey: `${groupIndex}` })))

const renderItem = <Message, Requirements>(h: HtmlBuilder<Message, Requirements>, choice: MenuChoice<string>): Html =>
  h.span(
    [h.Class(itemContent)],
    [
      h.span([h.Class(itemLabel)], [choice.label]),
      ...(choice.isChecked === true
        ? [
            h.span([h.Class(itemCheck)], [icon(h, "check", { size: "sm" })]),
            h.span([h.Class(hiddenState)], [" (selected)"])
          ]
        : [])
    ]
  )

const renderHeader = <Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  header: Readonly<{ title: string; detail?: string }>
): Html =>
  h.div(
    [h.Class(headerColumn)],
    [
      h.span([h.Class(headerTitle)], [header.title]),
      header.detail === undefined ? h.empty : h.span([h.Class(headerDetail)], [header.detail])
    ]
  )

/**
 * The heading of a group: its label, and, over the first group's, the menu's header and a line under it. The
 * headless menu has a place for nothing but items and the headings of their groups, so the header is the first
 * group's.
 */
const renderHeading = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MenuConfig<Value>,
  groupIndex: number
): Html | undefined => {
  const label = config.groups[groupIndex]?.label
  const header = groupIndex === 0 ? config.header : undefined
  if (label === undefined && header === undefined) return undefined

  return h.div(
    [],
    [
      header === undefined ? h.empty : renderHeader(h, header),
      header === undefined ? h.empty : h.hr([h.Class(separatorLook)]),
      label === undefined ? h.empty : h.span([h.Class(groupLabelLook)], [label])
    ]
  )
}

const renderTrigger = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  trigger: MenuTrigger
): Pick<ViewInputs<Value>, "buttonContent" | "buttonClassName"> & Readonly<{ ariaLabel?: string }> => {
  if (trigger.variant === "plain") {
    return { buttonContent: trigger.content, buttonClassName: plainTriggerLook, ariaLabel: trigger.name }
  }

  const look = { hasChevron: true }
  return {
    buttonContent: h.span([h.Class("contents")], buttonContent(h, trigger.text, look)),
    buttonClassName: buttonClass(look),
    ...(trigger.name === undefined ? {} : { ariaLabel: trigger.name })
  }
}

/**
 * The view inputs of the headless menu for `config`: the trigger, one item for each choice, each group's heading
 * with a line between the groups, and the list's place and look.
 */
const viewInputsOf = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MenuConfig<Value>
): ViewInputs<Value> => {
  const lines = flattenGroups(config.groups)
  const choiceOf = (value: Value) => lines.find(({ choice }) => choice.value === value)?.choice

  return {
    ...renderTrigger(h, config.trigger),
    items: lines.map(({ choice }) => choice.value),
    itemToConfig: (value) => ({
      className: itemLook,
      content: renderItem(h, choiceOf(value) ?? { value, label: value })
    }),
    itemToSearchText: (value) => choiceOf(value)?.label ?? value,
    itemGroupKey: (_value, index) => lines[index]?.groupKey ?? "0",
    groupToHeading: (groupKey) => {
      const content = renderHeading(h, config, Number(groupKey))
      return content === undefined ? undefined : { content }
    },
    separatorClassName: separatorLook,
    anchor: { placement: config.placement ?? "bottom-start", gap: anchorGap, padding: anchorPadding },
    className: wrapperLook,
    itemsClassName: panelLook,
    backdropClassName: backdropLook
  }
}

/**
 * A button that opens a menu of `groups` of choices, which `embed` puts the headless menu's view in. Choosing a
 * choice, with the pointer or Enter, closes the menu and reports its `value`; Escape, a click outside, and focus
 * leaving close it with no choice. A group with a `label` has a heading above it, and the `header`, a title over a
 * detail, is above the first group, as the account's name is over its sign-in address.
 */
export const menu = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: MenuConfig<Value>
): Html => config.embed(viewInputsOf(h, config))

/**
 * A button that shows the current one of `choices`, each a value and how the person reads it, and opens a menu to
 * choose another, as a select does in a toolbar. The button says `text` instead of the current choice's label when
 * given, such as "Status" while every status is chosen.
 */
export const choiceMenu = <Value extends string, Message, Requirements>(
  h: HtmlBuilder<Message, Requirements>,
  config: Readonly<{
    choices: ReadonlyArray<readonly [Value, string]>
    value: Value
    text?: string
    name?: string
    placement?: MenuPlacement
    embed: MenuConfig<Value>["embed"]
  }>
): Html =>
  menu(h, {
    trigger: {
      text: config.text ?? config.choices.find(([value]) => value === config.value)?.[1] ?? config.value,
      ...(config.name === undefined ? {} : { name: config.name })
    },
    ...(config.placement === undefined ? {} : { placement: config.placement }),
    groups: [
      {
        choices: config.choices.map(([value, label]) => ({ value, label, isChecked: value === config.value }))
      }
    ],
    embed: config.embed
  })
