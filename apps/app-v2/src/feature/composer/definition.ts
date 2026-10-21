/**
 * A composer: what the person writes at a place, a reply in a thread or a new thread in a group,
 * kept as a draft in their browser until they send it. It reports what it sends, and that its text
 * changed, to whatever holds it. While the person types a mention, `@` and some letters of a name, it
 * lists the people they may mean, and shows the one they pick as their name in the text. A button
 * starts a mention at the caret. A toolbar formats the selection as markdown, which a button shows and
 * hides, and which starts hidden on a phone. While the whole draft is a slash and some letters, `/fol`, it lists the
 * slash commands its holder offers; picking one clears the draft and reports the command.
 */

import { type Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { Viewport } from "@amends-dev/design/viewport"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { PickedMention, type Written } from "../../mentions.ts"
import { foldAccents } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"

/** What the list being picked from holds: the people a mention may mean, or the slash commands a draft may run. */
export const PickingKind = Schema.Literals(["Mention", "SlashCommand"])
export type PickingKind = typeof PickingKind.Type

/**
 * What is being typed for a list, a mention or a slash command: where its "@" or "/" is in the text, the letters
 * after it, which of the suggestions is active, and whether the person dismissed the list for these letters.
 */
export const Picking = Schema.Struct({
  kind: PickingKind,
  from: Schema.Int,
  query: Schema.String,
  activeIndex: Schema.Int,
  isDismissed: Schema.Boolean
})
export type Picking = typeof Picking.Type

/** The text selected in the box, from where it starts to where it ends; a caret is a selection of none. */
export const Selection = Schema.Struct({ from: Schema.Int, to: Schema.Int })
export type Selection = typeof Selection.Type

/** The ways the selection can be formatted, as the toolbar offers them. */
export const Format = Schema.Literals([
  "Bold",
  "Italic",
  "Strikethrough",
  "Link",
  "NumberedList",
  "BulletedList",
  "Quote",
  "Code",
  "CodeBlock"
])
export type Format = typeof Format.Type

/**
 * The commands a draft may run by typing a slash and their name, in place of being sent: following the group the
 * composer is in, stopping, and renaming it.
 */
export const SlashCommand = Schema.Literals(["follow", "unfollow", "rename"])
export type SlashCommand = typeof SlashCommand.Type

/** A slash command the composer's holder offers, and what running it does, such as "Rename #general". */
export type OfferedSlashCommand = Readonly<{ command: SlashCommand; description: string }>

/** What the selection is read for: to start a mention where it is, or to format it. */
export const Reading = Schema.TaggedUnion({ Mention: {}, Format: { format: Format } })
export type Reading = typeof Reading.Type

/**
 * Whose composer, at which place, the text it shows once its draft is read, the members picked in that text, the
 * mention being typed, whether the person chose to show or hide the formatting, and the window's width, which decides
 * it until they do.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  place: Drafts.Place,
  text: Schema.Option(Schema.String),
  mentions: Schema.Array(PickedMention),
  picking: Schema.Option(Picking),
  formattingChoice: Schema.Option(Schema.Boolean),
  viewport: Viewport
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedDraft: { text: Schema.String },
  TypedText: { text: Schema.String },
  PickedMention: { memberId: MemberId.MemberId, name: Schema.String },
  PickedSlashCommand: { command: SlashCommand },
  MovedSuggestion: { to: Schema.Int },
  DismissedSuggestions: {},
  ChoseFormat: { format: Format },
  ClickedMention: {},
  ClickedFormattingToggle: {},
  ChangedViewport: { viewport: Viewport },
  ReceivedSelection: { reading: Reading, selection: Schema.Option(Selection) },
  SubmittedText: {},
  CompletedSaveDraft: {},
  CompletedSelectText: {}
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  ChangedText: { text: Schema.String },
  SubmittedText: { text: Schema.String },
  RanSlashCommand: { command: SlashCommand }
})
export type OutMessage = typeof OutMessage.Type

export const ComposerDefinition = Block.makeDefinition("Composer", { Model, Message, OutMessage })
export const ComposerComposition = ComposerDefinition.makeComposition()

/** The id of the box at a place, so a label finds it and the focus can be moved to it. */
export const boxId = (place: Drafts.Place): string =>
  Drafts.Place.match(place, {
    Reply: ({ threadId }) => `reply-${threadId}`,
    Thread: ({ groupId }) => `thread-${groupId}`,
    Conversation: ({ memberIds }) => `conversation-${memberIds.join("-")}`
  })

/**
 * Whether the toolbar of formatting is shown: as the person chose, and until they do, unless the window is as narrow
 * as a phone's, where it starts hidden to leave room for the text.
 */
export const isFormattingShown = (model: Model): boolean =>
  Option.getOrElse(model.formattingChoice, () => model.viewport !== "Phone")

/** What the box shows and the members picked in it. */
export const writtenOf = (model: Model): Written => ({
  text: Option.getOrElse(model.text, () => ""),
  mentions: model.mentions
})

const mentionBeforeCaret = /(^|\s)@([^\s@]*)$/u

/**
 * The mention being typed that the caret is at the end of, when it is: an "@" at the start of the text or after a
 * space, with the letters after it, no space among them, up to the caret. A mention typed anywhere else, or past the
 * caret, is left as typed.
 */
export const mentionQueryAt = (text: string, caret: number): Option.Option<Readonly<{ from: number; query: string }>> =>
  Option.map(
    Option.fromNullishOr(mentionBeforeCaret.exec(text.slice(0, caret))),
    ({ 0: match, 1: lead, 2: query }) => ({
      from: caret - match.length + (lead ?? "").length,
      query: query ?? ""
    })
  )

const slashBeforeCaret = /^\/([\w-]*)$/u

/**
 * The slash command being typed that the caret is at the end of, when it is: the whole text is a "/" and the letters
 * after it, no space among them, and no mention picked. "/" later in the text, or after other words, is left as typed.
 */
export const slashQueryAt = (written: Written, caret: number): Option.Option<string> =>
  written.mentions.length === 0 && caret === written.text.length
    ? Option.map(Option.fromNullishOr(slashBeforeCaret.exec(written.text)), ({ 1: query }) => query ?? "")
    : Option.none()

/** The list being typed for once the box holds `written` with the caret at `caret`: what for, where, the letters. */
const typedFor = (
  written: Written,
  caret: number
): Option.Option<Readonly<{ kind: PickingKind; from: number; query: string }>> =>
  Option.orElse(
    Option.map(
      Option.filter(
        mentionQueryAt(written.text, caret),
        ({ from, query }) =>
          !written.mentions.some((mention) => mention.from < from + 1 + query.length && from < mention.to)
      ),
      (typed) => ({ kind: "Mention" as const, ...typed })
    ),
    () => Option.map(slashQueryAt(written, caret), (query) => ({ kind: "SlashCommand" as const, from: 0, query }))
  )

/**
 * The mention or slash command being typed once the box holds `written` with the caret at `caret`: not a picked
 * mention, and, for the letters it was dismissed for, as dismissed and as active as it was.
 */
export const pickingAfterTyping = (
  written: Written,
  caret: number,
  picking: Option.Option<Picking>
): Option.Option<Picking> =>
  Option.map(typedFor(written, caret), ({ kind, from, query }) =>
    Option.match(
      Option.filter(picking, (current) => current.kind === kind && current.query === query),
      {
        onNone: () => Picking.make({ kind, from, query, activeIndex: 0, isDismissed: false }),
        onSome: (current) => Picking.make({ ...current, from })
      }
    )
  )

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
