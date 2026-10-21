import type { Member } from "@amends-dev/core/workspace"
import { composer, type Formatting, type Suggestion, type Suggestions } from "@amends-dev/design/composer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import { memberMark } from "../../seen.ts"
import { ComposerComposition } from "./composition.ts"
import {
  boxId,
  isFormattingShown,
  Message,
  type Model,
  type OfferedSlashCommand,
  type Picking,
  suggestMembers
} from "./definition.ts"
import { buttonOf, formatGroups, formatOfKey } from "./format.ts"

/**
 * What the box shows while it is empty, which also names it, the members the person may mention in it, and the slash
 * commands it offers, none unless given. Its button is named Send, the button that starts a mention Mention someone,
 * and the toolbar of formatting, with the button that shows it, Formatting.
 */
export type ViewInputs = Readonly<{
  placeholder: string
  members: ReadonlyArray<Member.Member>
  commands?: ReadonlyArray<OfferedSlashCommand>
}>

const pickMention = ({ id, name }: Member.Member) => Message.PickedMention({ memberId: id, name })

/**
 * What the keys of the list do: move the active suggestion around it, pick the one that is active, which is what
 * `picks`, one for each suggestion, say, or dismiss the list.
 */
const answerKey = (key: string, picks: ReadonlyArray<Message>, activeIndex: number) =>
  Match.value(key).pipe(
    Match.when("ArrowDown", () => Option.some(Message.MovedSuggestion({ to: (activeIndex + 1) % picks.length }))),
    Match.when("ArrowUp", () =>
      Option.some(Message.MovedSuggestion({ to: (activeIndex + picks.length - 1) % picks.length }))
    ),
    Match.whenOr("Enter", "Tab", () => Option.fromNullishOr(picks[activeIndex])),
    Match.when("Escape", () => Option.some(Message.DismissedSuggestions())),
    Match.orElse(() => Option.none())
  )

/** The toolbar of formatting, with a button for each format, and the button that shows or hides it. */
const formattingOf = (model: Model): Formatting<Message> => ({
  id: `${boxId(model.place)}-formatting`,
  label: "Formatting",
  isShown: isFormattingShown(model),
  groups: formatGroups.map((group) =>
    group.map((format) => ({ ...buttonOf(format), onClick: Message.ChoseFormat({ format }) }))
  ),
  onToggle: Message.ClickedFormattingToggle()
})

/** The list named `label` of `items`, the one at `activeIndex` active, when there are any. */
const listOf = (
  id: string,
  label: string,
  items: ReadonlyArray<Omit<Suggestion<Message>, "isActive">>,
  activeIndex: number
): Option.Option<Suggestions<Message>> => {
  if (items.length === 0) return Option.none()

  const active = Math.min(activeIndex, items.length - 1)
  return Option.some({
    id,
    label,
    items: items.map((item, index) => ({ ...item, isActive: index === active })),
    onKeyDown: (key: string) =>
      answerKey(
        key,
        items.map(({ onPick }) => onPick),
        active
      )
  })
}

/** The people the mention being typed may mean, when at least one member fits its letters. */
const mentionSuggestions = (model: Model, members: ReadonlyArray<Member.Member>, { query, activeIndex }: Picking) =>
  listOf(
    `${boxId(model.place)}-members`,
    "People to mention",
    suggestMembers(members, model.memberId, query).map((member) => ({
      id: member.id,
      mark: memberMark(member),
      name: member.name,
      onPick: pickMention(member)
    })),
    activeIndex
  )

/** The slash commands offered whose name starts with the letters typed after the slash, in whatever case. */
const commandSuggestions = (model: Model, commands: ReadonlyArray<OfferedSlashCommand>, picking: Picking) =>
  listOf(
    `${boxId(model.place)}-commands`,
    "Commands",
    commands
      .filter(({ command }) => command.startsWith(picking.query.toLowerCase()))
      .map(({ command, description }) => ({
        id: command,
        name: `/${command}`,
        description,
        onPick: Message.PickedSlashCommand({ command })
      })),
    picking.activeIndex
  )

/**
 * What the mention or slash command being typed lists, while the person has not dismissed the list for its letters
 * and at least one person or command fits them.
 */
const suggestionsOf = (
  model: Model,
  members: ReadonlyArray<Member.Member>,
  commands: ReadonlyArray<OfferedSlashCommand>
): Option.Option<Suggestions<Message>> =>
  Option.flatMap(
    Option.filter(model.picking, ({ isDismissed }) => !isDismissed),
    (picking) =>
      picking.kind === "Mention"
        ? mentionSuggestions(model, members, picking)
        : commandSuggestions(model, commands, picking)
  )

export const view = ComposerComposition.makeView.withInputs<ViewInputs>(
  (model, { placeholder, members, commands = [] }, h) =>
    composer(h, {
      id: boxId(model.place),
      label: placeholder,
      placeholder,
      value: Option.getOrElse(model.text, () => ""),
      onInput: (text) => Message.TypedText({ text }),
      onSubmit: Message.SubmittedText(),
      submitLabel: "Send",
      formatting: formattingOf(model),
      mention: { label: "Mention someone", onClick: Message.ClickedMention() },
      onShortcut: (key, modifiers) =>
        Option.map(formatOfKey(key, modifiers), (format) => Message.ChoseFormat({ format })),
      suggestions: Option.getOrUndefined(suggestionsOf(model, members, commands))
    })
)
