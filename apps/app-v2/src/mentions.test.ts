import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { editedText, pickMention, readMarkdown, replaceRange, type Written, writeMarkdown } from "./mentions.ts"

const sara = MemberId.MemberId.make("member-sara")
const bob = MemberId.MemberId.make("member-bob")
const al = MemberId.MemberId.make("member-al")

const mention = (memberId: MemberId.MemberId, from: number, to: number) => ({ memberId, from, to })

/** "Hi @Sara Lind, are you free?", with Sara picked. */
const hiSara: Written = { text: "Hi @Sara Lind, are you free?", mentions: [mention(sara, 3, 13)] }

describe("mentions as the box shows them", () => {
  it("shows a mention link as its name with an @, and keeps which span it is", () => {
    expect(readMarkdown("Hi [@Sara Lind](member:member-sara), are you free?")).toEqual(hiSara)
    expect(readMarkdown("[@Bob](member:member-bob) and [@Sara Lind](member:member-sara)")).toEqual({
      text: "@Bob and @Sara Lind",
      mentions: [mention(bob, 0, 4), mention(sara, 9, 19)]
    })
  })

  it("shows text without a mention as it is, and a link that is not a member's as text", () => {
    expect(readMarkdown("")).toEqual({ text: "", mentions: [] })
    expect(readMarkdown("Plain **text**")).toEqual({ text: "Plain **text**", mentions: [] })
    expect(readMarkdown("See [docs](https://example.com)")).toEqual({
      text: "See [docs](https://example.com)",
      mentions: []
    })
  })

  it("reads a name written with the characters markdown escapes as the name itself", () => {
    expect(readMarkdown("[@A\\_B \\[C\\]](member:member-bob)")).toEqual({
      text: "@A_B [C]",
      mentions: [mention(bob, 0, 8)]
    })
  })

  it("writes each picked mention as the link to its member, in the order of the text", () => {
    expect(writeMarkdown(hiSara)).toBe("Hi [@Sara Lind](member:member-sara), are you free?")
    expect(writeMarkdown({ text: "@Sara Lind and @Bob", mentions: [mention(bob, 15, 19), mention(sara, 0, 10)] })).toBe(
      "[@Sara Lind](member:member-sara) and [@Bob](member:member-bob)"
    )
  })

  it("writes a name with the characters markdown reads as syntax escaped, and leaves the rest of the text as typed", () => {
    expect(writeMarkdown({ text: "*hi* @A_B", mentions: [mention(bob, 5, 9)] })).toBe(
      "*hi* [@A\\_B](member:member-bob)"
    )
  })

  it("reads what it writes, whatever the text around the mentions", () => {
    for (const markdown of [
      "[@Sara Lind](member:member-sara)",
      "Thanks [@Sara Lind](member:member-sara)!\n\n- [@Bob](member:member-bob) too",
      "No mention, a [link](https://example.com), and `code`",
      ""
    ]) {
      expect(writeMarkdown(readMarkdown(markdown))).toBe(markdown)
    }
  })

  it("writes text with no picked mention as it is, though it holds what looks like a mention", () => {
    expect(writeMarkdown({ text: "Hi @Sara Lind", mentions: [] })).toBe("Hi @Sara Lind")
  })
})

describe("replacing a range of what is written", () => {
  it("keeps a mention before the range, or touching its start, and moves one after it, or touching its end", () => {
    expect(replaceRange(hiSara, 13, 13, "!").mentions).toEqual([mention(sara, 3, 13)])
    expect(replaceRange(hiSara, 0, 3, "Hello ").mentions).toEqual([mention(sara, 6, 16)])
    expect(replaceRange(hiSara, 3, 3, ">> ").mentions).toEqual([mention(sara, 6, 16)])
    expect(replaceRange(hiSara, 0, 3, "").mentions).toEqual([mention(sara, 0, 10)])
  })

  it("drops a mention the range reaches into, whether it replaces some of its letters, adds some, or covers it", () => {
    expect(replaceRange(hiSara, 5, 6, "").text).toBe("Hi @Sra Lind, are you free?")
    expect(replaceRange(hiSara, 5, 6, "").mentions).toEqual([])
    expect(replaceRange(hiSara, 6, 6, "x").mentions).toEqual([])
    expect(replaceRange(hiSara, 0, 20, "Bye").mentions).toEqual([])
  })

  it("moves the mentions after it by what it adds or takes away", () => {
    const both: Written = { text: "@Bob @Sara Lind", mentions: [mention(bob, 0, 4), mention(sara, 5, 15)] }

    expect(replaceRange(both, 1, 4, "").text).toBe("@ @Sara Lind")
    expect(replaceRange(both, 0, 4, "Hi Bob").mentions).toEqual([mention(sara, 7, 17)])
    expect(replaceRange(both, 4, 4, ",").mentions).toEqual([mention(bob, 0, 4), mention(sara, 6, 16)])
  })
})

describe("what the box holds after the person types", () => {
  it("keeps a mention as the person writes after it, and puts the caret after what they wrote", () => {
    const edit = editedText(hiSara, "Hi @Sara Lind, are you free? Tomorrow?")

    expect(edit.written.mentions).toEqual([mention(sara, 3, 13)])
    expect(edit.written.text).toBe("Hi @Sara Lind, are you free? Tomorrow?")
    expect(edit.caret).toBe(38)
  })

  it("keeps a mention as the person writes right after it, and before it, moving it", () => {
    expect(editedText(hiSara, "Hi @Sara Lind!, are you free?").written.mentions).toEqual([mention(sara, 3, 13)])
    expect(editedText(hiSara, "Oh, Hi @Sara Lind, are you free?").written.mentions).toEqual([mention(sara, 7, 17)])
  })

  it("makes a mention plain text when the person writes letters against it, which run it on into another word", () => {
    expect(editedText(hiSara, "Hi @Sara Lindy, are you free?").written.mentions).toEqual([])
    expect(editedText(hiSara, "Hi x@Sara Lind, are you free?").written.mentions).toEqual([])
    expect(editedText(hiSara, "Hi @Sara Lind2, are you free?").written.mentions).toEqual([])
    expect(editedText(hiSara, "Hi @Sara Lind., are you free?").written.mentions).toEqual([mention(sara, 3, 13)])
    expect(editedText(hiSara, "Hi (@Sara Lind, are you free?").written.mentions).toEqual([mention(sara, 4, 14)])
  })

  it("makes a mention plain text once the person edits its letters", () => {
    const inserted = editedText(hiSara, "Hi @Sarah Lind, are you free?")
    const replaced = editedText(hiSara, "Hi @Sara Lund, are you free?")

    expect(inserted.written).toEqual({ text: "Hi @Sarah Lind, are you free?", mentions: [] })
    expect(replaced.written).toEqual({ text: "Hi @Sara Lund, are you free?", mentions: [] })
  })

  it("removes a mention whole when the person deletes its last letter, as Backspace does just after it", () => {
    const edit = editedText(hiSara, "Hi @Sara Lin, are you free?")

    expect(edit.written).toEqual({ text: "Hi , are you free?", mentions: [] })
    expect(edit.caret).toBe(3)
  })

  it("removes a mention whole when the person deletes its last word, or all of it", () => {
    expect(editedText(hiSara, "Hi @Sara , are you free?").written.text).toBe("Hi , are you free?")
    expect(editedText(hiSara, "Hi , are you free?").written).toEqual({ text: "Hi , are you free?", mentions: [] })
  })

  it("keeps the other mentions when it removes one", () => {
    const both: Written = { text: "@Bob @Sara Lind", mentions: [mention(bob, 0, 4), mention(sara, 5, 15)] }

    expect(editedText(both, "@Bob @Sara Lin").written).toEqual({ text: "@Bob ", mentions: [mention(bob, 0, 4)] })
    expect(editedText(both, "@Bo @Sara Lind").written).toEqual({
      text: " @Sara Lind",
      mentions: [mention(sara, 1, 11)]
    })
  })

  it("makes a mention plain text when a deletion reaches into it and goes past its end or starts before it", () => {
    expect(editedText(hiSara, "Hi @Sara Lin are you free?").written).toEqual({
      text: "Hi @Sara Lin are you free?",
      mentions: []
    })
    expect(editedText(hiSara, "Hi Lind, are you free?").written).toEqual({
      text: "Hi Lind, are you free?",
      mentions: []
    })
  })

  it("keeps a mention when the deletion is just after it", () => {
    expect(editedText(hiSara, "Hi @Sara Lind are you free?").written.mentions).toEqual([mention(sara, 3, 13)])
  })

  it("keeps a mention when the deletion is after it", () => {
    const edit = editedText(hiSara, "Hi @Sara Lind, are you")

    expect(edit.written.mentions).toEqual([mention(sara, 3, 13)])
    expect(edit.caret).toBe(22)
  })

  it("changes nothing when the text is the same", () => {
    expect(editedText(hiSara, hiSara.text)).toEqual({ written: hiSara, caret: hiSara.text.length })
  })
})

describe("picking a mention", () => {
  it("writes the member's name with an @ in place of the letters typed, a space after it, and the caret after the space", () => {
    const typing: Written = { text: "Hi @al there", mentions: [] }
    const picked = pickMention(typing, { from: 3, to: 6 }, { memberId: sara, name: "Sara Lind" })

    expect(picked.written).toEqual({ text: "Hi @Sara Lind  there", mentions: [mention(sara, 3, 13)] })
    expect(picked.caret).toBe(14)
  })

  it("keeps the mentions picked before and moves those after", () => {
    const typing: Written = { text: "@Bob and @al, @Sara Lind", mentions: [mention(bob, 0, 4), mention(sara, 14, 24)] }
    const picked = pickMention(typing, { from: 9, to: 12 }, { memberId: al, name: "Al" })

    expect(picked.written.text).toBe("@Bob and @Al , @Sara Lind")
    expect(picked.written.mentions).toEqual([mention(bob, 0, 4), mention(sara, 15, 25), mention(al, 9, 12)])
  })
})
