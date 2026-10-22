/**
 * The formatting of a composer's text box: the markdown each format writes around the selection or on the selected
 * lines and where the selection is once it is written. The box shows what is
 * written, markdown, and messages render it, so formatting is the markdown syntax written for the person; applying the
 * format that already holds where the selection is takes it away again.
 */

import * as Match from "effect/Match"
import { replaceRange, type Written } from "../../control/mentions.ts"
import type { Format, Selection } from "./definition.ts"

/** The text a format wrote, and where the selection is: on what was formatted, or where the person writes next. */
export type Formatted = Readonly<{ written: Written; selection: Selection }>

const countBefore = (text: string, at: number, character: string): number => {
  let count = 0
  while (at - 1 - count >= 0 && text[at - 1 - count] === character) {
    count += 1
  }

  return count
}

const countAfter = (text: string, at: number, character: string): number => {
  let count = 0
  while (at + count < text.length && text[at + count] === character) {
    count += 1
  }

  return count
}

/**
 * Whether `count` of the marker's character in a row, beside the selection, make `marker`: two for bold and
 * strikethrough and one for code, or more; for italic an odd number, since two are bold's and three are both.
 */
const isMarker = (marker: string, count: number): boolean => (marker === "*" ? count % 2 === 1 : count >= marker.length)

/** The range of `from` to `to` without the spaces and line breaks at its ends, for a marker that must touch words. */
const trimmed = (text: string, from: number, to: number): Selection => {
  const selected = text.slice(from, to)
  const start = from + (selected.length - selected.trimStart().length)
  const end = to - (selected.length - selected.trimEnd().length)

  return start < end ? { from: start, to: end } : { from: to, to }
}

/**
 * Wrap the selection in `marker`, or take the marker off when it is there: just outside the selection, or its first and
 * last characters. With nothing selected it writes the marker twice with the caret between them, to write the formatted
 * words, or takes away two that surround the caret.
 */
const toggleInline = (written: Written, { from, to }: Selection, marker: string): Formatted => {
  const { text } = written
  const length = marker.length
  const character = marker.charAt(0)

  if (isMarker(marker, countBefore(text, from, character)) && isMarker(marker, countAfter(text, to, character))) {
    const withoutClosing = replaceRange(written, to, to + length, "")

    return {
      written: replaceRange(withoutClosing, from - length, from, ""),
      selection: { from: from - length, to: to - length }
    }
  }

  if (
    to - from >= 2 * length &&
    isMarker(marker, countAfter(text, from, character)) &&
    isMarker(marker, countBefore(text, to, character))
  ) {
    const withoutClosing = replaceRange(written, to - length, to, "")

    return {
      written: replaceRange(withoutClosing, from, from + length, ""),
      selection: { from, to: to - 2 * length }
    }
  }

  const words = trimmed(text, from, to)
  const withClosing = replaceRange(written, words.to, words.to, marker)

  return {
    written: replaceRange(withClosing, words.from, words.from, marker),
    selection: { from: words.from + length, to: words.to + length }
  }
}

/**
 * Write the selection, or "link" with nothing selected, as `[text](url)`, with the address selected, so that the person
 * types it in its place. Linking what is already a link links it again.
 */
const writeLink = (written: Written, { from, to }: Selection): Formatted => {
  const label = from === to ? "link" : written.text.slice(from, to)
  const address = from + label.length + 3

  return {
    written: replaceRange(written, from, to, `[${label}](url)`),
    selection: { from: address, to: address + "url".length }
  }
}

/** How a format marks the start of a line: the marker already there, and what to write for the line at `position`. */
type LineMarker = Readonly<{ existing: RegExp; prefix: (position: number) => string; isList: boolean }>

const lineMarkers: Readonly<Record<"NumberedList" | "BulletedList" | "Quote", LineMarker>> = {
  NumberedList: { existing: /^\d+\. /u, prefix: (position) => `${position}. `, isList: true },
  BulletedList: { existing: /^[-*+] /u, prefix: () => "- ", isList: true },
  Quote: { existing: /^> ?/u, prefix: () => "> ", isList: false }
}

const anyListMarker = /^(?:[-*+]|\d+\.) /u

const lineStart = (text: string, at: number): number => (at === 0 ? 0 : text.lastIndexOf("\n", at - 1) + 1)

const lineEnd = (text: string, at: number): number => {
  const end = text.indexOf("\n", at)

  return end === -1 ? text.length : end
}

/** A line of the selection and where it starts. */
type Line = Readonly<{ text: string; start: number }>

/** The lines of the text from `first`, the start of one, up to `last`, the end of one. */
const linesOf = (text: string, first: number, last: number): ReadonlyArray<Line> => {
  const lines: Array<Line> = []
  let start = first
  for (const line of text.slice(first, last).split("\n")) {
    lines.push({ text: line, start })
    start += line.length + 1
  }

  return lines
}

/**
 * Give every line the selection touches the marker of `kind`, or take it off when each already has it: a list's lines
 * are numbered in order, and a line that has the other list's marker has it replaced. Lines without words are left
 * alone unless the selection is on that one line, so that the person can write the first item of a list. A caret stays
 * after the marker or where it was among the words; a selection spans the lines.
 */
const toggleLines = (written: Written, { from, to }: Selection, kind: LineMarker): Formatted => {
  const { text } = written
  const first = lineStart(text, from)
  const last = lineEnd(text, to > from && text[to - 1] === "\n" ? to - 1 : to)
  const lines = linesOf(text, first, last)
  const targets = lines.length === 1 ? lines : lines.filter((line) => line.text.trim() !== "")
  const isRemoving = targets.length > 0 && targets.every((line) => kind.existing.test(line.text))

  const markers = targets.map((line, index) => {
    const replaced = (isRemoving || !kind.isList ? kind.existing : anyListMarker).exec(line.text)?.[0] ?? ""

    return { start: line.start, replaced: replaced.length, written: isRemoving ? "" : kind.prefix(index + 1) }
  })
  const edited = [...markers]
    .reverse()
    .reduce(
      (current, marker) => replaceRange(current, marker.start, marker.start + marker.replaced, marker.written),
      written
    )
  const delta = markers.reduce((total, marker) => total + marker.written.length - marker.replaced, 0)

  if (from === to) {
    const marker = markers.at(0)
    const caret =
      marker === undefined
        ? from
        : marker.start + marker.written.length + Math.max(0, from - (marker.start + marker.replaced))

    return { written: edited, selection: { from: caret, to: caret } }
  }

  return { written: edited, selection: { from: first, to: last + delta } }
}

const opening = "```\n"
const closing = "\n```"

/**
 * Put the selection between fences of three backticks on lines of their own, or take the fences off when they are on
 * the lines just around the selection. With nothing selected it writes two fences with an empty line between them for
 * the caret.
 */
const toggleCodeBlock = (written: Written, { from, to }: Selection): Formatted => {
  const { text } = written

  if (
    from >= opening.length &&
    text.slice(from - opening.length, from) === opening &&
    text.slice(to, to + closing.length) === closing
  ) {
    const withoutClosing = replaceRange(written, to, to + closing.length, "")

    return {
      written: replaceRange(withoutClosing, from - opening.length, from, ""),
      selection: { from: from - opening.length, to: to - opening.length }
    }
  }

  const start = (text.slice(lineStart(text, from), from) === "" ? "" : "\n") + opening
  const end = closing + (text.slice(to, lineEnd(text, to)) === "" ? "" : "\n")
  const withClosing = replaceRange(written, to, to, end)

  return {
    written: replaceRange(withClosing, from, from, start),
    selection: { from: from + start.length, to: to + start.length }
  }
}

/** `written` formatted as `format`, for the text selected: what it becomes, and where the selection is then. */
export const applyFormat = (written: Written, format: Format, selection: Selection): Formatted =>
  Match.value(format).pipe(
    Match.when("Bold", () => toggleInline(written, selection, "**")),
    Match.when("Italic", () => toggleInline(written, selection, "*")),
    Match.when("Strikethrough", () => toggleInline(written, selection, "~~")),
    Match.when("Code", () => toggleInline(written, selection, "`")),
    Match.when("Link", () => writeLink(written, selection)),
    Match.when("NumberedList", () => toggleLines(written, selection, lineMarkers.NumberedList)),
    Match.when("BulletedList", () => toggleLines(written, selection, lineMarkers.BulletedList)),
    Match.when("Quote", () => toggleLines(written, selection, lineMarkers.Quote)),
    Match.when("CodeBlock", () => toggleCodeBlock(written, selection)),
    Match.exhaustive
  )
