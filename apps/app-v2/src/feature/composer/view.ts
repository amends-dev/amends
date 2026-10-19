import * as Option from "effect/Option"
import { submit, textarea } from "../../controls.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerComposition } from "./composition.ts"
import { Message } from "./definition.ts"

/** How the box is labelled, and what its button says. */
export type ViewInputs = Readonly<{ label: string; submitLabel: string }>

/** The id of the box at a place, so a label finds it. */
const idOf = (place: Drafts.Place) =>
  Drafts.Place.match(place, {
    Reply: ({ threadId }) => `reply-${threadId}`,
    Thread: ({ groupId }) => `thread-${groupId}`
  })

export const view = ComposerComposition.makeView.withInputs<ViewInputs>((model, { label, submitLabel }, h) =>
  h.form(
    [h.OnSubmit(Message.SubmittedText())],
    [
      textarea(h, {
        id: idOf(model.place),
        label,
        value: Option.getOrElse(model.text, () => ""),
        onInput: (text) => Message.TypedText({ text })
      }),
      submit(h, submitLabel)
    ]
  )
)
