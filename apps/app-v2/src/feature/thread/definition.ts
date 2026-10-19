/**
 * A thread as the person reads and takes part in it: its title and messages, their part in it, how
 * far they have read, who types there, the task it tracks, its agents' turns, and a composer to
 * reply. They rename it, edit and delete their own messages, and follow it or stop; reading it
 * marks it read through its latest activity.
 */

import { Contact } from "@amends-dev/core/channel"
import { Presence } from "@amends-dev/core/presence"
import { ThreadId, ThreadMessage, ThreadMessageId, ThreadParticipationId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { ComposerBlock } from "../composer/block.ts"
import { TaskBlock } from "../task/block.ts"
import { TurnsBlock } from "../turns/block.ts"

/** A message of the thread, and whether it is still being posted. */
export const MessageItem = Schema.Struct({ message: ThreadMessage.ThreadMessage, pending: Schema.Boolean })
export type MessageItem = typeof MessageItem.Type

/** The person's part in the thread: their participation, whether it is active, and whether a change to it is on its way. */
export const Following = Schema.Struct({
  participationId: ThreadParticipationId.ThreadParticipationId,
  active: Schema.Boolean,
  pending: Schema.Boolean
})
export type Following = typeof Following.Type

/** A message being edited, and its new text. */
export const Editing = Schema.Struct({ messageId: ThreadMessageId.ThreadMessageId, draft: Schema.String })
export type Editing = typeof Editing.Type

/**
 * The thread's title, when it has one, its messages, the person's part in it, the sequence of its
 * latest activity, how far they have read it and asked to, the title or message being changed,
 * whether they said lately that they type there, who could have written its messages, who is
 * present, the reply being written, the task it tracks, its agents' turns, and why the last read or
 * write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId,
  title: Schema.Option(Schema.String),
  messages: Schema.Array(MessageItem),
  following: Schema.Option(Following),
  latest: Schema.Int,
  readThrough: Schema.Int,
  readRequested: Schema.Int,
  renaming: Schema.Option(Schema.String),
  editing: Schema.Option(Editing),
  typingTold: Schema.Boolean,
  members: Schema.Array(Member.Member),
  contacts: Schema.Array(Contact.Contact),
  present: Schema.Array(Presence.Present),
  reply: ComposerBlock.Model,
  task: TaskBlock.Model,
  turns: TurnsBlock.Model,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

/** What the reply composer, the task, and the turns are made from: the thread, as the member. */
export const ChildInitContext = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId
})

export const Message = defineMessageUnion({
  ReceivedThread: {
    title: Schema.Option(Schema.String),
    messages: Schema.Array(MessageItem),
    following: Schema.Option(Following),
    latest: Schema.Int,
    readThrough: Schema.Int
  },
  ReceivedPeople: { members: Schema.Array(Member.Member), contacts: Schema.Array(Contact.Contact) },
  ReceivedPresence: { present: Schema.Array(Presence.Present) },
  FailedRead: { error: Schema.String },
  ClickedRename: {},
  TypedTitle: { title: Schema.String },
  SubmittedRename: {},
  ClickedCancelRename: {},
  ClickedEdit: { messageId: ThreadMessageId.ThreadMessageId },
  TypedEdit: { text: Schema.String },
  SubmittedEdit: {},
  ClickedCancelEdit: {},
  ClickedDelete: { messageId: ThreadMessageId.ThreadMessageId },
  ClickedFollow: {},
  ClickedUnfollow: {},
  ToldTyping: {},
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

export const ThreadDefinition = Block.makeDefinition("Thread", { Model, Message, ChildInitContext })

/** The text and revision of `messageId`, while it has text. */
export const textOf = (model: Model, messageId: ThreadMessageId.ThreadMessageId) =>
  Option.flatMap(
    Option.fromUndefinedOr(model.messages.find(({ message }) => message.id === messageId)),
    ({ message }) =>
      ThreadMessage.Content.match(message.content, {
        Text: ({ text, revision }) => Option.some({ text, revision }),
        Deleted: () => Option.none()
      })
  )

/** Who wrote a message, by their name here: a member's, or the name a channel's contact gave. */
export const authorName = (model: Model, message: ThreadMessage.ThreadMessage) =>
  ThreadMessage.Author.match(message.author, {
    Member: ({ memberId }) => model.members.find((member) => member.id === memberId)?.name ?? "Someone",
    Contact: ({ contactId }) => model.contacts.find(({ id }) => id === contactId)?.name ?? "A contact"
  })

/** Who other than the person types in the thread now, by their names here. */
export const typingIn = (model: Model) =>
  model.present
    .filter((present) => present.typingIn === model.threadId && present.memberId !== model.memberId)
    .map(({ memberId }) => model.members.find((member) => member.id === memberId)?.name ?? "Someone")
