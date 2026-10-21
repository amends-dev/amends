import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import type { Written } from "../../mentions.ts"
import type { Format } from "./definition.ts"
import { applyFormat } from "./format.ts"

/** The text a format writes where `from` to `to` of `text` is selected, and where the selection is then. */
const formatted = (format: Format, text: string, from: number, to: number = from) => {
  const result = applyFormat({ text, mentions: [] }, format, { from, to })

  return { text: result.written.text, from: result.selection.from, to: result.selection.to }
}

describe("formatting a selection inline", () => {
  it("wraps the selected words in the format's markers and selects them between", () => {
    expect(formatted("Bold", "say hello now", 4, 9)).toEqual({ text: "say **hello** now", from: 6, to: 11 })
    expect(formatted("Italic", "say hello now", 4, 9)).toEqual({ text: "say *hello* now", from: 5, to: 10 })
    expect(formatted("Strikethrough", "say hello now", 4, 9)).toEqual({ text: "say ~~hello~~ now", from: 6, to: 11 })
    expect(formatted("Code", "say hello now", 4, 9)).toEqual({ text: "say `hello` now", from: 5, to: 10 })
  })

  it("leaves the spaces and line breaks at the ends of the selection outside the markers", () => {
    expect(formatted("Bold", "say hello now", 3, 10)).toEqual({ text: "say **hello** now", from: 6, to: 11 })
    expect(formatted("Italic", "a\nb\n", 1, 4)).toEqual({ text: "a\n*b*\n", from: 3, to: 4 })
  })

  it("writes the markers around the caret, which stays between them, when nothing is selected", () => {
    expect(formatted("Bold", "say  now", 4)).toEqual({ text: "say **** now", from: 6, to: 6 })
    expect(formatted("Italic", "", 0)).toEqual({ text: "**", from: 1, to: 1 })
    expect(formatted("Code", "x", 1)).toEqual({ text: "x``", from: 2, to: 2 })
  })

  it("takes the markers off again when they are just outside the selection or its first and last characters", () => {
    expect(formatted("Bold", "say **hello** now", 6, 11)).toEqual({ text: "say hello now", from: 4, to: 9 })
    expect(formatted("Bold", "say **hello** now", 4, 13)).toEqual({ text: "say hello now", from: 4, to: 9 })
    expect(formatted("Bold", "say **** now", 6)).toEqual({ text: "say  now", from: 4, to: 4 })
    expect(formatted("Code", "say `hello` now", 5, 10)).toEqual({ text: "say hello now", from: 4, to: 9 })
    expect(formatted("Strikethrough", "~~hello~~", 2, 7)).toEqual({ text: "hello", from: 0, to: 5 })
  })

  it("tells italic from bold by the stars: italic over bold adds one pair, and takes only that one off", () => {
    expect(formatted("Italic", "**b**", 2, 3)).toEqual({ text: "***b***", from: 3, to: 4 })
    expect(formatted("Italic", "***b***", 3, 4)).toEqual({ text: "**b**", from: 2, to: 3 })
    expect(formatted("Bold", "***b***", 3, 4)).toEqual({ text: "*b*", from: 1, to: 2 })
    expect(formatted("Bold", "*b*", 1, 2)).toEqual({ text: "***b***", from: 3, to: 4 })
  })

  it("keeps a mention that the markers surround, shifted by the opening marker", () => {
    const written: Written = {
      text: "Hi @Sara Lind!",
      mentions: [{ memberId: MemberId.MemberId.make("member-sara"), from: 3, to: 13 }]
    }
    const result = applyFormat(written, "Bold", { from: 3, to: 13 })

    expect(result.written).toEqual({
      text: "Hi **@Sara Lind**!",
      mentions: [{ memberId: "member-sara", from: 5, to: 15 }]
    })
    expect(result.selection).toEqual({ from: 5, to: 15 })
  })
})

describe("formatting a link", () => {
  it("writes the selection as the text of a link and selects its address, to type it in place", () => {
    expect(formatted("Link", "see docs now", 4, 8)).toEqual({ text: "see [docs](url) now", from: 11, to: 14 })
  })

  it("writes a link named link when nothing is selected", () => {
    expect(formatted("Link", "", 0)).toEqual({ text: "[link](url)", from: 7, to: 10 })
    expect(formatted("Link", "see ", 4)).toEqual({ text: "see [link](url)", from: 11, to: 14 })
  })
})

describe("formatting the lines of a selection", () => {
  it("numbers the lines the selection touches in order, and takes the numbers off when each line has one", () => {
    expect(formatted("NumberedList", "a\nb\nc", 0, 5)).toEqual({ text: "1. a\n2. b\n3. c", from: 0, to: 14 })
    expect(formatted("NumberedList", "1. a\n2. b\n3. c", 0, 14)).toEqual({ text: "a\nb\nc", from: 0, to: 5 })
  })

  it("touches the lines the selection reaches into, whole, and not the lines around them", () => {
    expect(formatted("BulletedList", "x\na\nb\ny", 3, 5)).toEqual({ text: "x\n- a\n- b\ny", from: 2, to: 9 })
  })

  it("puts a bullet on a line and keeps the caret after it, or where it was among the words", () => {
    expect(formatted("BulletedList", "a", 1)).toEqual({ text: "- a", from: 3, to: 3 })
    expect(formatted("BulletedList", "abc", 1)).toEqual({ text: "- abc", from: 3, to: 3 })
    expect(formatted("BulletedList", "x\nabc", 3)).toEqual({ text: "x\n- abc", from: 5, to: 5 })
    expect(formatted("BulletedList", "- abc", 3)).toEqual({ text: "abc", from: 1, to: 1 })
  })

  it("writes the first item of a list on an empty line, with the caret after the marker", () => {
    expect(formatted("NumberedList", "", 0)).toEqual({ text: "1. ", from: 3, to: 3 })
    expect(formatted("Quote", "a\n", 2)).toEqual({ text: "a\n> ", from: 4, to: 4 })
  })

  it("leaves the empty lines of a selection alone and numbers the others in order", () => {
    expect(formatted("NumberedList", "a\n\nb", 0, 4)).toEqual({ text: "1. a\n\n2. b", from: 0, to: 10 })
  })

  it("replaces the marker of the other kind of list", () => {
    expect(formatted("BulletedList", "1. a\n2. b", 0, 9)).toEqual({ text: "- a\n- b", from: 0, to: 7 })
    expect(formatted("NumberedList", "- a\n* b", 0, 7)).toEqual({ text: "1. a\n2. b", from: 0, to: 9 })
  })

  it("quotes lines and unquotes them again", () => {
    expect(formatted("Quote", "a\nb", 0, 3)).toEqual({ text: "> a\n> b", from: 0, to: 7 })
    expect(formatted("Quote", "> a\n> b", 0, 7)).toEqual({ text: "a\nb", from: 0, to: 3 })
    // A quote already begun is not quoted twice.
    expect(formatted("Quote", "> a\nb", 0, 5)).toEqual({ text: "> a\n> b", from: 0, to: 7 })
  })

  it("does not take in the line that starts where a selection of whole lines ends", () => {
    expect(formatted("Quote", "a\nb\nc", 0, 4)).toEqual({ text: "> a\n> b\nc", from: 0, to: 7 })
  })

  it("keeps a mention on a line it formats, shifted by what is written before it", () => {
    const written: Written = {
      text: "a\n@Sara Lind",
      mentions: [{ memberId: MemberId.MemberId.make("member-sara"), from: 2, to: 12 }]
    }

    expect(applyFormat(written, "Quote", { from: 0, to: 12 }).written).toEqual({
      text: "> a\n> @Sara Lind",
      mentions: [{ memberId: "member-sara", from: 6, to: 16 }]
    })
  })
})

describe("formatting a code block", () => {
  it("puts the selection between fences on lines of their own and selects it between them", () => {
    expect(formatted("CodeBlock", "x", 0, 1)).toEqual({ text: "```\nx\n```", from: 4, to: 5 })
    expect(formatted("CodeBlock", "say x now", 4, 5)).toEqual({ text: "say \n```\nx\n```\n now", from: 9, to: 10 })
  })

  it("writes two fences with an empty line between them for the caret when nothing is selected", () => {
    expect(formatted("CodeBlock", "", 0)).toEqual({ text: "```\n\n```", from: 4, to: 4 })
  })

  it("takes the fences off when they are on the lines just around the selection", () => {
    expect(formatted("CodeBlock", "```\nx\n```", 4, 5)).toEqual({ text: "x", from: 0, to: 1 })
  })
})
