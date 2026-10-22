import { describe, expect, it } from "@effect/vitest"
import { markdownWords } from "../src/markdown.ts"

const ada = { id: "member-1", name: "Ada Lovelace" }
const mention = (id: string, label: string) => `[@${label}](member:${id})`

describe("markdownWords", () => {
  it("is the words of the text without its syntax, a space between blocks", () => {
    expect(markdownWords({ text: "# Plan\n\nShip **it** `now`\n\n- one\n- two\n\n> quoted\n\n```\ncode\n```" })).toBe(
      "Plan Ship it now one two quoted code"
    )
  })

  it("reads a mention as the name the member has now, or the one the text recorded", () => {
    const text = `Hey ${mention("member-1", "Ada")}, ${mention("gone", "Old name")} look`
    expect(markdownWords({ text, mentions: [ada] })).toBe("Hey @Ada Lovelace, @Old name look")
    expect(markdownWords({ text })).toBe("Hey @Ada, @Old name look")
  })

  it("reads a link as its words, an image as its name, and entity references as their characters", () => {
    expect(markdownWords({ text: "[docs](https://example.com) ![chart](/c.png) Tom &amp; Jerry" })).toBe(
      "docs chart Tom & Jerry"
    )
  })

  it("is the text of the inline form, and nothing for empty text", () => {
    expect(markdownWords({ text: "" })).toBe("")
    expect(markdownWords({ text: "\n\n" })).toBe("")
  })
})
