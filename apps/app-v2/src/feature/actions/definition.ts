/**
 * The person's actions the server has not finished, as they read them: what each does, the text
 * it carries, and why it was refused, until they dismiss it.
 */

import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"

/** An action the server has not finished: which, what it does, its text, and why it was refused. */
export const ActionItem = Schema.Struct({
  key: Schema.String,
  tag: Schema.String,
  what: Schema.String,
  text: Schema.Option(Schema.String),
  rejection: Schema.Option(Schema.String)
})
export type ActionItem = typeof ActionItem.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  actions: Schema.Array(ActionItem),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedActions: { actions: Schema.Array(ActionItem) },
  FailedRead: { error: Schema.String },
  ClickedDismiss: { key: Schema.String },
  CompletedDismiss: {}
})
export type Message = typeof Message.Type

export const ActionsDefinition = Block.makeDefinition("Actions", { Model, Message })
