/**
 * Reading the draft at the composer's place once it opens, and keeping it as the person writes it, and reading and
 * setting the selection in its box, which no handler of the builder gives.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Render from "foldkit/render"
import * as Drafts from "../../store/Drafts.ts"
import * as Stores from "../../store/Stores.ts"
import { ComposerDefinition, Message, Reading } from "./definition.ts"

/** Read the draft at `place`; one that cannot be read is empty. */
export const ReadDraft = ComposerDefinition.makeCommand("ReadDraft", {
  args: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, place: Drafts.Place },
  messages: [Message.ReceivedDraft],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ workspaceId, memberId, place }) =>
      Effect.scoped(Effect.flatMap(stores.open(workspaceId, memberId), (store) => store.draft(place))).pipe(
        Effect.map((text) => Message.ReceivedDraft({ text })),
        Effect.orElseSucceed(() => Message.ReceivedDraft({ text: "" }))
      )
  }
})

/** Keep `text` as the draft at `place`, or forget the draft, given none. */
export const SaveDraft = ComposerDefinition.makeCommand("SaveDraft", {
  args: {
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    place: Drafts.Place,
    text: Schema.String
  },
  messages: [Message.CompletedSaveDraft],
  handler: function* () {
    const stores = yield* Stores.Stores
    return ({ workspaceId, memberId, place, text }) =>
      stores
        .write(workspaceId, memberId, (store) => store.saveDraft(place, text))
        .pipe(
          Effect.tapCause((cause) => Effect.logWarning("The draft could not be kept", cause)),
          Effect.ignore,
          Effect.as(Message.CompletedSaveDraft())
        )
  }
})

/**
 * Read the selection of the box `id`, as it stands before the render in progress commits, which is what the person
 * selected, and say what it was read for.
 */
export const ReadSelection = ComposerDefinition.makeCommand("ReadSelection", {
  args: { id: Schema.String, reading: Reading },
  messages: [Message.ReceivedSelection],
  handler: function* () {
    return ({ id, reading }) =>
      Effect.sync(() => {
        const box = document.getElementById(id)

        return Message.ReceivedSelection({
          reading,
          selection:
            box instanceof HTMLTextAreaElement
              ? Option.some({ from: box.selectionStart, to: box.selectionEnd })
              : Option.none()
        })
      })
  }
})

/**
 * Select the text of the box `id` from `from` to `to` and give it the focus, once the render in progress has committed,
 * so that the person goes on typing where the text was changed for them: setting a box's value moves the caret to its
 * end.
 */
export const SelectText = ComposerDefinition.makeCommand("SelectText", {
  args: { id: Schema.String, from: Schema.Int, to: Schema.Int },
  messages: [Message.CompletedSelectText],
  handler: function* () {
    return ({ id, from, to }) =>
      Effect.gen(function* () {
        yield* Render.afterCommit

        const box = document.getElementById(id)

        if (box instanceof HTMLTextAreaElement) {
          box.focus()
          box.setSelectionRange(from, to)
        }

        return Message.CompletedSelectText()
      })
  }
})

export const EffectsLayer = Layer.mergeAll(ReadDraft.layer, SaveDraft.layer, ReadSelection.layer, SelectText.layer)
