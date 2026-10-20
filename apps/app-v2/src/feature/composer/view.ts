import type { Member } from "@amends-dev/core/workspace"
import { composer, type MentionSuggestions } from "@amends-dev/design/composer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import { memberMark } from "../../seen.ts"
import { ComposerComposition } from "./composition.ts"
import { boxId, Message, type Model, suggestMembers } from "./definition.ts"

/**
 * How the box is labelled, what it shows while it is empty, and what its button says, and the members the
 * person may mention in it.
 */
export type ViewInputs = Readonly<{
  label: string
  placeholder: string
  submitLabel: string
  members: ReadonlyArray<Member.Member>
}>

const pickMention = ({ id, name }: Member.Member) => Message.PickedMention({ memberId: id, name })

/** What the keys of the list do: move the active suggestion around it, pick it, or dismiss the list. */
const answerKey = (key: string, suggested: ReadonlyArray<Member.Member>, activeIndex: number) =>
  Match.value(key).pipe(
    Match.when("ArrowDown", () => Option.some(Message.MovedSuggestion({ to: (activeIndex + 1) % suggested.length }))),
    Match.when("ArrowUp", () =>
      Option.some(Message.MovedSuggestion({ to: (activeIndex + suggested.length - 1) % suggested.length }))
    ),
    Match.whenOr("Enter", "Tab", () => Option.map(Option.fromNullishOr(suggested[activeIndex]), pickMention)),
    Match.when("Escape", () => Option.some(Message.DismissedSuggestions())),
    Match.orElse(() => Option.none())
  )

/**
 * The members the mention being typed may mean, listed while the person has not dismissed the list for its
 * letters and at least one member fits them.
 */
const suggestionsOf = (
  model: Model,
  members: ReadonlyArray<Member.Member>
): Option.Option<MentionSuggestions<Message>> =>
  Option.flatMap(
    Option.filter(model.picking, ({ isDismissed }) => !isDismissed),
    ({ query, activeIndex }) => {
      const suggested = suggestMembers(members, model.memberId, query)
      if (suggested.length === 0) return Option.none()

      const active = Math.min(activeIndex, suggested.length - 1)
      return Option.some({
        id: `${boxId(model.place)}-members`,
        items: suggested.map((member, index) => ({
          id: member.id,
          mark: memberMark(member),
          name: member.name,
          isActive: index === active,
          onPick: pickMention(member)
        })),
        onKeyDown: (key: string) => answerKey(key, suggested, active)
      })
    }
  )

export const view = ComposerComposition.makeView.withInputs<ViewInputs>(
  (model, { label, placeholder, submitLabel, members }, h) =>
    composer(h, {
      id: boxId(model.place),
      label,
      placeholder,
      value: Option.getOrElse(model.text, () => ""),
      onInput: (text) => Message.TypedText({ text }),
      onSubmit: Message.SubmittedText(),
      submitLabel,
      suggestions: Option.getOrUndefined(suggestionsOf(model, members))
    })
)
