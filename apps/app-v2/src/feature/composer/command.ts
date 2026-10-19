/** Reading the draft at the composer's place once it opens, and keeping it as the person writes. */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Drafts from "../../store/Drafts.ts"
import * as Stores from "../../store/Stores.ts"
import { ComposerDefinition, Message } from "./definition.ts"

/** Read the draft at `place`; one that cannot be read is empty. */
export const ReadDraft = ComposerDefinition.command("ReadDraft", {
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
export const SaveDraft = ComposerDefinition.command("SaveDraft", {
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

export const EffectsLayer = Layer.mergeAll(ReadDraft.layer, SaveDraft.layer)
