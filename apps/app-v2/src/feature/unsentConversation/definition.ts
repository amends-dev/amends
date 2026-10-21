/**
 * A conversation the person has not started, as it will be once they send its first message: the people it is with,
 * the workspace's members to name them by, and a composer for that message. Nothing is written before it is sent; the
 * message starts the conversation (`StartConversation`). The Block reports the conversation as soon as the store lists
 * one with exactly these people, which is the one the person's own message starts, or one made on another device in
 * the meantime.
 */

import { GroupId } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { namesOf } from "../../seen.ts"
import { ComposerBlock } from "../composer/block.ts"

/**
 * The workspace and the person, the other people the conversation is with, in the order a direct group lists its
 * members, the workspace's members, which name them and may be mentioned, the composer of the first message, and why
 * the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  memberIds: Schema.Array(MemberId.MemberId),
  members: Schema.Array(Member.Member),
  composer: ComposerBlock.Model,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

/** What the composer is made from: the people the conversation is with, as the member. */
export const ChildInitContext = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  memberIds: Schema.Array(MemberId.MemberId)
})

export const Message = defineMessageUnion({
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedConversation: { groupId: Schema.Option(GroupId.GroupId) },
  FailedRead: { error: Schema.String },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

/** The conversation with exactly these people is listed, which the parent opens in place of this one. */
export const OutMessage = defineMessageUnion({
  FoundConversation: { groupId: GroupId.GroupId }
})
export type OutMessage = typeof OutMessage.Type

export const UnsentConversationDefinition = Block.makeDefinition("UnsentConversation", {
  Model,
  Message,
  OutMessage,
  ChildInitContext
})

/** The people the conversation is with, by their names as a conversation with them is named: "Bob" or "Bob, Carol". */
export const nameOf = (model: Pick<Model, "members" | "memberIds">): string => namesOf(model.members, model.memberIds)

/** The person the conversation is with, when it is with one alone. */
export const soleMemberId = (model: Pick<Model, "memberIds">): Option.Option<MemberId.MemberId> =>
  model.memberIds.length === 1 ? Array.head(model.memberIds) : Option.none()
