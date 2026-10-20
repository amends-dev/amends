import { ThreadMessage } from "@amends-dev/core/thread"
import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { SaveDraft } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import { completeTail, Message, type Model, OutMessage, Picking, tailQuery } from "./definition.ts"

/** Keep `text` as the draft of `model`'s place. */
const saveDraft = ({ workspaceId, memberId, place }: Model, text: string) =>
  SaveDraft({ workspaceId, memberId, place, text })

/**
 * The mention being typed once the box holds `text`: the one it was while it is for the same letters, so a
 * dismissed list stays dismissed and the active suggestion stays active.
 */
const pickingAfterTyping = (text: string, picking: Option.Option<Picking>) =>
  Option.map(tailQuery(text), (query) =>
    Option.getOrElse(
      Option.filter(picking, (current) => current.query === query),
      () => Picking.make({ query, activeIndex: 0, isDismissed: false })
    )
  )

/** The box holds `text`: it is kept as the draft and reported to whatever holds the composer. */
const changeText = (model: Model, text: string, picking: Option.Option<Picking>) => ({
  model: modifyFields(model, { text: () => Option.some(text), picking: () => picking }),
  commands: [saveDraft(model, text)],
  outMessage: OutMessage.ChangedText({ text })
})

export const update = ComposerComposition.makeUpdate((model, message) =>
  Message.match(message, {
    // A draft read once the place opened fills it in, unless the person began writing there meanwhile.
    ReceivedDraft: ({ text }) => ({ model: modifyFields(model, { text: Option.orElseSome(() => text) }) }),
    TypedText: ({ text }) => changeText(model, text, pickingAfterTyping(text, model.picking)),
    // The mention at the end of the text becomes the link to the member, and the list closes.
    PickedMention: ({ memberId, name }) =>
      changeText(
        model,
        completeTail(
          Option.getOrElse(model.text, () => ""),
          ThreadMessage.mentionText(memberId, name)
        ),
        Option.none()
      ),
    // The view counts the suggestions, so it says which one is active.
    MovedSuggestion: ({ to }) => ({
      model: modifyFields(model, {
        picking: Option.map((picking) => Picking.make({ ...picking, activeIndex: to }))
      })
    }),
    DismissedSuggestions: () => ({
      model: modifyFields(model, {
        picking: Option.map((picking) => Picking.make({ ...picking, isDismissed: true }))
      })
    }),
    SubmittedText: () => {
      const text = Option.getOrElse(model.text, () => "")
      if (text.trim() === "") return { model }
      return {
        model: modifyFields(model, { text: () => Option.some(""), picking: () => Option.none() }),
        commands: [saveDraft(model, "")],
        outMessage: OutMessage.SubmittedText({ text })
      }
    },
    CompletedSaveDraft: () => ({ model })
  })
)
