import { describe, expect, it } from "@effect/vitest"
import { bob, membership, scout } from "../../test/fixtures.ts"
import { isAgent } from "../data/members.ts"
import { initials, memberMark } from "./members.ts"

describe("initials", () => {
  it("is the first letters of the first two words of a name, in capitals", () => {
    expect(initials("Alex Morgan")).toBe("AM")
    expect(initials("mary jane watson")).toBe("MJ")
    expect(initials("  Alex   Morgan ")).toBe("AM")
  })

  it("is the first letter of a name of one word", () => {
    expect(initials("Yumi")).toBe("Y")
    expect(initials("scout")).toBe("S")
  })

  it("is nothing for a name with no letters, and takes a whole character for the first of a word", () => {
    expect(initials("")).toBe("")
    expect(initials("   ")).toBe("")
    expect(initials("🦊 Fox")).toBe("🦊F")
  })
})

describe("a member's mark", () => {
  it("is their initials on the neutral tone for a person", () => {
    expect(isAgent(bob)).toBe(false)
    expect(memberMark(bob)).toEqual({ text: "B", tone: "neutral" })
    expect(memberMark(membership.member)).toEqual({ text: "A", tone: "neutral" })
  })

  it("is their initials on the lilac tone for an agent", () => {
    expect(isAgent(scout)).toBe(true)
    expect(memberMark(scout)).toEqual({ text: "S", tone: "lilac" })
  })
})
