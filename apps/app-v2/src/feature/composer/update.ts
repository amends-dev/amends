import * as Option from "effect/Option"
import { modifyFields } from "foldkit/struct"
import { SaveDraft } from "./command.ts"
import { ComposerComposition } from "./composition.ts"
import { Message, type Model, OutMessage } from "./definition.ts"

/** Keep `text` as the draft of `model`'s place. */
const saveDraft = ({ workspaceId, memberId, place }: Model, text: string) =>
  SaveDraft({ workspaceId, memberId, place, text })

export const update = ComposerComposition.makeUpdate((model, message) =>
  Message.match(message, {
    // A draft read once the place opened fills it in, unless the person began writing there meanwhile.
    ReceivedDraft: ({ text }) => ({ model: modifyFields(model, { text: Option.orElseSome(() => text) }) }),
    TypedText: ({ text }) => ({
      model: modifyFields(model, { text: () => Option.some(text) }),
      commands: [saveDraft(model, text)],
      outMessage: OutMessage.ChangedText({ text })
    }),
    SubmittedText: () => {
      const text = Option.getOrElse(model.text, () => "")
      if (text === "") return { model }
      return {
        model: modifyFields(model, { text: () => Option.some("") }),
        commands: [saveDraft(model, "")],
        outMessage: OutMessage.SubmittedText({ text })
      }
    },
    CompletedSaveDraft: () => ({ model })
  })
)
