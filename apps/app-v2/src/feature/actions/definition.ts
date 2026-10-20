/**
 * The person's actions the server has not finished, as they read them: what each does, the text
 * it carries, and why it was refused, until they dismiss it; and what the page confirms to the
 * person that they did, which goes by itself after a while.
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

/** What the person did that is confirmed, with the ID it can be dismissed by. */
export const Confirmation = Schema.Struct({ id: Schema.Finite, text: Schema.String })
export type Confirmation = typeof Confirmation.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  actions: Schema.Array(ActionItem),
  confirmations: Schema.Array(Confirmation),
  nextConfirmationId: Schema.Finite,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedActions: { actions: Schema.Array(ActionItem) },
  FailedRead: { error: Schema.String },
  ClickedDismiss: { key: Schema.String },
  CompletedDismiss: {},
  Confirmed: { text: Schema.String },
  ClickedDismissConfirmation: { id: Schema.Finite },
  ExpiredConfirmation: { id: Schema.Finite }
})
export type Message = typeof Message.Type

export const ActionsDefinition = Block.makeDefinition("Actions", { Model, Message })
