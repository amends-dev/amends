import { ThreadMessage } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { bob, membership, opening, saying, thread } from "../../test/fixtures.ts"
import { threadContains, threadWords } from "./threads.ts"

const members = [membership.member, bob]

describe("threadWords", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

  it("is the title when the thread has one, and the words of the opening without, with a mention as its member's name", () => {
    expect(threadWords({ ...thread, title: "Retro" }, Option.some(asked), members)).toBe("Retro")
    expect(threadWords(thread, Option.some(asked), members)).toBe("@Bob can you check this?")
  })

  it("keeps a title as written and leaves the syntax out of an opening", () => {
    const formatted = saying(opening, "**Ship** the *retry* fix")

    expect(threadWords({ ...thread, title: "*Retro*" }, Option.some(formatted), members)).toBe("*Retro*")
    expect(threadWords(thread, Option.some(formatted), members)).toBe("Ship the retry fix")
  })

  it("is A thread while the opening is not read", () => {
    expect(threadWords(thread, Option.none(), members)).toBe("A thread")
  })
})

describe("threadContains", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the café menu?`)
  const contains = (query: string, titled: string | null = null) =>
    threadContains({ ...thread, title: titled }, Option.some(asked), members, query)

  it("is whether the title has the letters, or the opening's words do, in any case and whatever the accents", () => {
    expect(contains("RETRO", "Retro")).toBe(true)
    expect(contains("check")).toBe(true)
    expect(contains("CAFE")).toBe(true)
    expect(contains("retro")).toBe(false)
  })

  it("finds a title and an opening alike, as the person reads the opening's mention: the member's current name", () => {
    expect(contains("retro", "Retro")).toBe(true)
    expect(contains("check", "Retro")).toBe(true)
    expect(contains("@bob")).toBe(true)
    expect(contains("robert")).toBe(false)
  })

  it("reads the opening's words without the syntax of its markdown", () => {
    const formatted = saying(opening, "**Ship** the [retry fix](https://example.com) `now`")
    const containsFormatted = (query: string) => threadContains(thread, Option.some(formatted), members, query)

    expect(containsFormatted("ship the retry fix now")).toBe(true)
    expect(containsFormatted("**")).toBe(false)
    expect(containsFormatted("example.com")).toBe(false)
    expect(containsFormatted("`now`")).toBe(false)
  })

  it("leaves out the spaces around the letters, and keeps every thread for none", () => {
    expect(contains("  menu ")).toBe(true)
    expect(contains("")).toBe(true)
    expect(contains("   ")).toBe(true)
    expect(contains("  nothing like it ")).toBe(false)
  })

  it("has no words to find while the opening is not read and the thread has no title", () => {
    expect(threadContains(thread, Option.none(), members, "check")).toBe(false)
    expect(threadContains(thread, Option.none(), members, "")).toBe(true)
    expect(threadContains({ ...thread, title: "Retro" }, Option.none(), members, "retro")).toBe(true)
  })
})
