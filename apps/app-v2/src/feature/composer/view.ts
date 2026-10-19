import { composer } from "@amends-dev/design/composer"
import * as Option from "effect/Option"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerComposition } from "./composition.ts"
import { Message } from "./definition.ts"

/** How the box is labelled, what it shows while it is empty, and what its button says. */
export type ViewInputs = Readonly<{ label: string; placeholder: string; submitLabel: string }>

/** The id of the box at a place, so a label finds it. */
const idOf = (place: Drafts.Place) =>
  Drafts.Place.match(place, {
    Reply: ({ threadId }) => `reply-${threadId}`,
    Thread: ({ groupId }) => `thread-${groupId}`
  })

export const view = ComposerComposition.makeView.withInputs<ViewInputs>(
  (model, { label, placeholder, submitLabel }, h) =>
    composer(h, {
      id: idOf(model.place),
      label,
      placeholder,
      value: Option.getOrElse(model.text, () => ""),
      onInput: (text) => Message.TypedText({ text }),
      onSubmit: Message.SubmittedText(),
      submitLabel
    })
)
