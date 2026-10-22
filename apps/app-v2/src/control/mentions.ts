/**
 * What a person writes that mentions members, as a text box holds it: the text the box shows, in which a mention is
 * "@Sara Lind", and which spans of it are members the person picked from the list. The message a person sends and the
 * draft the browser keeps are markdown, in which a mention is the link `[@Sara Lind](member:<id>)`; `readMarkdown` and
 * `writeMarkdown` go from one to the other. A span is kept while the text around it changes and is dropped, leaving
 * its words as plain text, once an edit reaches into it.
 */

import { ThreadMessage } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

/**
 * A member picked from the list, and the span of the text that shows them, "@" and their name, from where it starts to
 * where it ends.
 */
export const PickedMention = Schema.Struct({ memberId: MemberId.MemberId, from: Schema.Int, to: Schema.Int })
export type PickedMention = typeof PickedMention.Type

/** The text a box shows and the mentions picked in it. */
export type Written = Readonly<{ text: string; mentions: ReadonlyArray<PickedMention> }>

/** The text of a mention as the box shows it: the "@" and the name. */
const shownMention = (name: string): string => `@${name}`

const nothingWritten: Written = { text: "", mentions: [] }

/** The text and mentions that markdown says: each mention link shown as "@" and the name it was written with. */
export const readMarkdown = (markdown: string): Written =>
  Array.reduce(ThreadMessage.parts(markdown), nothingWritten, (written, part) =>
    ThreadMessage.Part.match(part, {
      Text: ({ text }) => ({ text: written.text + text, mentions: written.mentions }),
      Mention: ({ memberId, label }) => {
        const shown = shownMention(label)

        return {
          text: written.text + shown,
          mentions: [
            ...written.mentions,
            PickedMention.make({ memberId, from: written.text.length, to: written.text.length + shown.length })
          ]
        }
      }
    })
  )

const byStart = Order.mapInput(Order.Number, ({ from }: PickedMention) => from)

/** The markdown that says what `written` says: each picked mention as the link to its member, named as it is shown. */
export const writeMarkdown = ({ text, mentions }: Written): string => {
  const ordered = Array.sort(mentions, byStart)
  const written = ordered.reduce(
    (markdown, { memberId, from, to }) => ({
      markdown:
        markdown.markdown +
        text.slice(markdown.end, from) +
        ThreadMessage.mentionText(memberId, text.slice(from + 1, to)),
      end: to
    }),
    { markdown: "", end: 0 }
  )

  return written.markdown + text.slice(written.end)
}

const startsWithLetter = /^[\p{L}\p{N}_]/u
const endsWithLetter = /[\p{L}\p{N}_]$/u

/**
 * `written` with the text from `from` up to `to` replaced by `insertion`. A mention before the replaced text, or
 * touching its start, stays; one after it, or touching its end, moves by what the replacement adds or takes away; one
 * the replaced text reaches into is dropped, and its words stay as plain text. So is one that letters are written
 * against, which runs on into another word, such as "Bobby" after "@Bob"; punctuation and spaces are not.
 */
export const replaceRange = (written: Written, from: number, to: number, insertion: string): Written => {
  const delta = insertion.length - (to - from)
  const isInsertion = from === to

  return {
    text: written.text.slice(0, from) + insertion + written.text.slice(to),
    mentions: written.mentions.flatMap((mention) => {
      if (isInsertion && mention.to === from && startsWithLetter.test(insertion)) {
        return []
      }

      if (isInsertion && mention.from === from && endsWithLetter.test(insertion)) {
        return []
      }

      if (mention.to <= from) {
        return [mention]
      }

      if (mention.from >= to) {
        return [PickedMention.make({ ...mention, from: mention.from + delta, to: mention.to + delta })]
      }

      return []
    })
  }
}

/**
 * How many characters `before` and `after` start with in common, then end with in common, together no more than the
 * shorter has.
 */
const unchanged = (before: string, after: string): Readonly<{ start: number; end: number }> => {
  const shortest = Math.min(before.length, after.length)
  let start = 0
  while (start < shortest && before[start] === after[start]) {
    start += 1
  }

  let end = 0
  while (end < shortest - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end += 1
  }

  return { start, end }
}

/** What an edit left: the text and mentions, and where the caret is. */
export type Edit = Readonly<{ written: Written; caret: number }>

/**
 * The mention a deletion removes whole: one the deleted text ends at the end of, which is Backspace with the caret just
 * after the mention, and the person never sees half a name.
 */
const mentionDeletedAtEnd = (
  written: Written,
  deleted: Readonly<{ from: number; to: number }>
): Option.Option<PickedMention> =>
  Array.findFirst(written.mentions, ({ from, to }) => from <= deleted.from && deleted.from < to && to === deleted.to)

/**
 * What the box holds once the person has typed, pasted, or deleted, so that its text is `text`, found by comparing it
 * with the text before: the edit is the part that differs, and the caret is where it ends. A mention the edit reaches
 * into becomes plain text, and one whose last letters it deletes is removed whole, so the text this returns is shorter
 * than `text` by the rest of that mention.
 */
export const editedText = (before: Written, text: string): Edit => {
  const { start, end } = unchanged(before.text, text)
  const from = start
  const to = before.text.length - end
  const insertion = text.slice(start, text.length - end)

  const removed = insertion === "" ? mentionDeletedAtEnd(before, { from, to }) : Option.none()

  return Option.match(removed, {
    onNone: () => ({ written: replaceRange(before, from, to, insertion), caret: from + insertion.length }),
    onSome: (mention) => ({ written: replaceRange(before, mention.from, mention.to, ""), caret: mention.from })
  })
}

/**
 * `written` with the text from `from` up to `to` replaced by the mention of the member `memberId`, "@" and their
 * `name`, and a space after it, so that typing goes on; the caret is after the space.
 */
export const pickMention = (
  written: Written,
  range: Readonly<{ from: number; to: number }>,
  member: Readonly<{ memberId: MemberId.MemberId; name: string }>
): Edit => {
  const shown = shownMention(member.name)
  const replaced = replaceRange(written, range.from, range.to, `${shown} `)

  return {
    written: {
      text: replaced.text,
      mentions: [
        ...replaced.mentions,
        PickedMention.make({ memberId: member.memberId, from: range.from, to: range.from + shown.length })
      ]
    },
    caret: range.from + shown.length + 1
  }
}
