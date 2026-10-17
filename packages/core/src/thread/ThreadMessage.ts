/**
 * A message in a thread: markdown written by a member or a contact, and whom it addresses, as last
 * edited, or deleted. Its place in the thread is activity, `ThreadMessageActivity.Published`,
 * recorded with it; the message row holds the text once, and edits and deletions replace it there.
 * `ThreadMessageService` publishes, edits, and deletes replies, and `ThreadService` publishes the
 * message that opens a thread.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as ChannelId from "../channel/ChannelId.ts"
import * as GroupId from "../group/GroupId.ts"
import * as Identity from "../identity/Identity.ts"
import * as Characters from "../text/Text.ts"
import * as TurnId from "../turn/TurnId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ThreadId from "./ThreadId.ts"
import * as ThreadMessageId from "./ThreadMessageId.ts"

/**
 * Markdown, preserved as submitted, including indentation; whitespace-only text and characters
 * storage cannot keep as given are rejected. A mention in it is a link to the member, written by
 * `mentionText`.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Text = Schema.NonEmptyString.check(
  Schema.makeFilter((text) => /\S/u.test(text) || "Message text must contain non-whitespace content"),
  Characters.isStorable
)

/**
 * @category schemas
 * @since 0.1.0
 */
export type Text = typeof Text.Type

// Backslash-escaped so a name reads as itself, not as markdown, inside the link's label.
const labelMarks = /[\\[\]*_`~<>]/gu

/**
 * A member mentioned in message text: `[@Ada](member:<id>)`. The label records the name they had
 * when mentioned, and readers show their current one. The text shows who was mentioned; a
 * message's `mentions` are whom it addresses.
 *
 * @category constructors
 * @since 0.1.0
 */
export const mentionText = (memberId: string, name: string) =>
  `[@${name.replaceAll(labelMarks, "\\$&")}](member:${encodeURIComponent(memberId)})`

const mentionLinks = /\[@(?:\\.|[^\\\]])*\]\(member:([^)\s]+)\)/gu

/**
 * The members a text mentions, each once, in the order first mentioned.
 *
 * @category getters
 * @since 0.1.0
 */
export const mentionedIn = (text: string): ReadonlyArray<string> => [
  ...new Set(
    [...text.matchAll(mentionLinks)].flatMap(([, id]) => {
      try {
        return [decodeURIComponent(id!)]
      } catch {
        return []
      }
    })
  )
]

/**
 * Who wrote a message: a member, human or agent, writing in a thread, or a contact whose message a
 * channel received. An agent's reply is its own message like anyone's; the turn that produced it
 * is how the agent worked, not who wrote it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Author = Schema.TaggedUnion({
  Member: { memberId: MemberId.MemberId },
  Contact: { contactId: Identity.ContactId }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Author = typeof Author.Type

/**
 * How a message came about, when not written in amends: an agent's reply names the turn that
 * posted it, whose log tells how, and a message a channel received names the channel and the id
 * the external system gave the message.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Via = Schema.TaggedUnion({
  Turn: { turnId: TurnId.TurnId },
  Channel: { channelId: ChannelId.ChannelId, externalMessageId: Schema.NonEmptyString }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Via = typeof Via.Type

/**
 * Which edit of a message its content is: 1 as published, and one more per edit.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Revision = Schema.Int.check(Schema.isGreaterThan(0))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Revision = typeof Revision.Type

/**
 * What a message says now: its text and whom it addresses, at the revision its last edit made,
 * or nothing since it was deleted. The text is the only copy of it in the read models.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Content = Schema.TaggedUnion({
  Text: {
    text: Text,
    mentions: Schema.UniqueArray(MemberId.MemberId),
    revision: Revision,
    /** When it was last edited, or null as published. */
    editedAt: Schema.NullOr(Schema.DateTimeUtcFromString)
  },
  Deleted: { deletedAt: Schema.DateTimeUtcFromString }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Content = typeof Content.Type

/**
 * A message as published, edited, and deleted. Its position in the thread is on its activity, not
 * here, and stays through edits and deletion.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadMessage = Schema.Struct({
  id: ThreadMessageId.ThreadMessageId,
  workspaceId: WorkspaceId.WorkspaceId,
  threadId: ThreadId.ThreadId,
  author: Author,
  /** How it came about, or null for one written in amends. */
  via: Schema.NullOr(Via),
  publishedAt: Schema.DateTimeUtcFromString,
  content: Content
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ThreadMessage extends Schema.Schema.Type<typeof ThreadMessage> {}

/**
 * The content a message is published with: its text and mentions at revision 1.
 *
 * @category constructors
 * @since 0.1.0
 */
export const published = (text: Text, mentions: ReadonlyArray<MemberId.MemberId>): Content =>
  Content.cases.Text.make({ text, mentions, revision: 1, editedAt: null })

/**
 * What a reply says and whom it addresses. Without mentions it addresses every current
 * participant.
 *
 * @category options
 * @since 0.1.0
 */
export const PublishInput = Schema.Struct({
  threadId: ThreadId.ThreadId,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.MemberId)
})

/**
 * @category options
 * @since 0.1.0
 */
export interface PublishInput extends Schema.Schema.Type<typeof PublishInput> {}

/**
 * What an edit says and whom it addresses, and the revision the editor last saw, so an edit made
 * meanwhile is not silently replaced.
 *
 * @category options
 * @since 0.1.0
 */
export const EditInput = Schema.Struct({
  messageId: ThreadMessageId.ThreadMessageId,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.MemberId),
  expectedRevision: Revision
})

/**
 * @category options
 * @since 0.1.0
 */
export interface EditInput extends Schema.Schema.Type<typeof EditInput> {}

/**
 * What editing a message records: its next revision, the new text and mentions, and when. The
 * group is the fact's audience.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Edited = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  messageId: ThreadMessageId.ThreadMessageId,
  revision: Revision,
  text: Text,
  mentions: Schema.UniqueArray(MemberId.MemberId),
  editedAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Edited extends Schema.Schema.Type<typeof Edited> {}

/**
 * What deleting a message records: which, and when. The group is the fact's audience.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Deleted = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  threadId: ThreadId.ThreadId,
  groupId: GroupId.GroupId,
  messageId: ThreadMessageId.ThreadMessageId,
  deletedAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Deleted extends Schema.Schema.Type<typeof Deleted> {}
