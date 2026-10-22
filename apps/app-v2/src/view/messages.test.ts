import { ThreadMessage } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { bob, deleted, membership, opening, reply, saying, thread } from "../../test/fixtures.ts"
import { isStackedUnder, messageText, threadText, typingLine } from "./messages.ts"

const members = [membership.member, bob]

describe("messageText", () => {
  it("is the markdown of what a message says, with the members its mentions may name", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you *check* this?`)

    expect(messageText(asked, members)).toEqual({
      text: `${ThreadMessage.mentionText(bob.id, "Robert")} can you *check* this?`,
      mentions: members
    })
    expect(messageText(reply, members)).toEqual({ text: "Sounds good", mentions: members })
  })

  it("says a deleted message was deleted, in the words that show quiet and slanted", () => {
    expect(messageText(deleted(reply), members)).toEqual({ deleted: "Message deleted" })
  })
})

describe("threadText", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

  it("is the title as written when the thread has one, whatever markdown it holds", () => {
    expect(threadText({ ...thread, title: "Retro" }, Option.some(asked), members)).toBe("Retro")
    expect(threadText({ ...thread, title: "*Retro*" }, Option.some(asked), members)).toBe("*Retro*")
  })

  it("is the opening's text without a title, and A thread while the opening is not read", () => {
    expect(threadText(thread, Option.some(asked), members)).toEqual(messageText(asked, members))
    expect(threadText(thread, Option.none(), members)).toBe("A thread")
  })
})

describe("isStackedUnder", () => {
  const alice = ThreadMessage.Author.cases.Member.make({ memberId: membership.member.id })
  const robert = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })
  const at = (minutes: number) =>
    DateTime.add(DateTime.makeUnsafe("2026-10-18T12:00:00Z"), { milliseconds: minutes * 60_000 })
  const written = (minutes: number, author = alice, hasReplies = false) => ({ author, at: at(minutes), hasReplies })

  it("is true for the same author within five minutes after the message before", () => {
    expect(isStackedUnder(written(1), written(0))).toBe(true)
    expect(isStackedUnder(written(4.99), written(0))).toBe(true)
    expect(isStackedUnder(written(0), written(0))).toBe(true)
  })

  it("is false five minutes or more after it, or before it", () => {
    expect(isStackedUnder(written(5), written(0))).toBe(false)
    expect(isStackedUnder(written(60), written(0))).toBe(false)
    expect(isStackedUnder(written(0), written(1))).toBe(false)
  })

  it("is false for another author, and for the first message, which has none before it", () => {
    expect(isStackedUnder(written(1, robert), written(0))).toBe(false)
    expect(isStackedUnder(written(1), undefined)).toBe(false)
  })

  it("is false when either has replies, since a thread's replies end a stack and start their own", () => {
    expect(isStackedUnder(written(1, alice, true), written(0))).toBe(false)
    expect(isStackedUnder(written(1), written(0, alice, true))).toBe(false)
  })
})

describe("typingLine", () => {
  it("is nothing while no one types", () => {
    expect(typingLine([])).toEqual(Option.none())
  })

  it("names one person and two, and says several people for three or more", () => {
    expect(typingLine(["Ada"])).toEqual(Option.some("Ada is typing…"))
    expect(typingLine(["Ada", "Bob"])).toEqual(Option.some("Ada and Bob are typing…"))
    expect(typingLine(["Ada", "Bob", "Cy"])).toEqual(Option.some("Several people are typing…"))
    expect(typingLine(["Ada", "Bob", "Cy", "Di", "Ed"])).toEqual(Option.some("Several people are typing…"))
  })
})
