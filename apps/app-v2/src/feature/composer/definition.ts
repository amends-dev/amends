/**
 * A composer: what the person writes at a place, a reply in a thread or a new thread in a group,
 * kept as a draft in their browser until they send it. It reports what it sends, and that its text
 * changed, to whatever holds it. While the person types a mention at the end of the text, `@` and
 * some letters of a name, it lists the people they may mean, and writes the one they pick into the
 * text as a link.
 */

import { type Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { foldAccents } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"

/**
 * The mention being typed at the end of the text: the letters after its "@", which of the suggestions
 * is active, and whether the person dismissed the list for these letters.
 */
export const Picking = Schema.Struct({ query: Schema.String, activeIndex: Schema.Int, isDismissed: Schema.Boolean })
export type Picking = typeof Picking.Type

/** Whose composer, at which place, its text, once its draft is read, and the mention being typed. */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  place: Drafts.Place,
  text: Schema.Option(Schema.String),
  picking: Schema.Option(Picking)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedDraft: { text: Schema.String },
  TypedText: { text: Schema.String },
  PickedMention: { memberId: MemberId.MemberId, name: Schema.String },
  MovedSuggestion: { to: Schema.Int },
  DismissedSuggestions: {},
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

/** The id of the box at a place, so a label finds it and the focus can be moved to it. */
export const boxId = (place: Drafts.Place): string =>
  Drafts.Place.match(place, {
    Reply: ({ threadId }) => `reply-${threadId}`,
    Thread: ({ groupId }) => `thread-${groupId}`,
    Conversation: ({ memberIds }) => `conversation-${memberIds.join("-")}`
  })

const mentionAtEnd = /(^|\s)@([^\s@]*)$/u

/**
 * The letters after the "@" that ends `text`, when it ends in a mention being typed: an "@" at the start
 * or after a space, and no space after it. A mention typed anywhere else in the text is left as typed.
 */
export const tailQuery = (text: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(mentionAtEnd.exec(text)), ([, , query]) => query ?? "")

/** `text` with the mention being typed at its end written as `mention`, and a space after it. */
export const completeTail = (text: string, mention: string): string =>
  text.replace(mentionAtEnd, (_, lead: string) => `${lead}${mention} `)

/** The most people the list suggests. */
export const maxSuggestions = 8

/**
 * The active members, other than `memberId`, with a word of their name that starts with `query`, whatever its case
 * or accents, in the order of `members`, up to `maxSuggestions`: "al" finds "Alan Turing" and "Mary Alvarez", and not
 * "Natalie".
 */
export const suggestMembers = (
  members: ReadonlyArray<Member.Member>,
  memberId: MemberId.MemberId,
  query: string
): ReadonlyArray<Member.Member> => {
  const prefix = foldAccents(query)

  return members
    .filter(
      (member) =>
        member.id !== memberId &&
        member.status === "active" &&
        foldAccents(member.name)
          .split(/\s+/u)
          .some((word) => word.startsWith(prefix))
    )
    .slice(0, maxSuggestions)
}
