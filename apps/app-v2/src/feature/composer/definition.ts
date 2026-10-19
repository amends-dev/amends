/**
 * A composer: what the person writes at a place, a reply in a thread or a new thread in a group,
 * kept as a draft in their browser until they send it. It reports what it sends, and that its text
 * changed, to whatever holds it.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import * as Drafts from "../../store/Drafts.ts"

/** Whose composer, at which place, and its text, once its draft is read. */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  place: Drafts.Place,
  text: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedDraft: { text: Schema.String },
  TypedText: { text: Schema.String },
  SubmittedText: {},
  CompletedSaveDraft: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ChangedText: { text: Schema.String },
  SubmittedText: { text: Schema.String }
})
export type OutMessage = typeof OutMessage.Type

export const ComposerDefinition = Block.makeDefinition("Composer", { Model, Message, OutMessage })
