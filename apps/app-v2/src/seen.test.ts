import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import { initials, timeOf } from "./seen.ts"

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

describe("timeOf", () => {
  it("is the time of day, with hours and minutes only", () => {
    const time = timeOf(DateTime.makeUnsafe("2026-10-18T12:05:00Z"))

    expect(time).toMatch(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i)
    expect(time).not.toMatch(/2026|Oct/)
  })

  it("tells times five minutes apart apart", () => {
    expect(timeOf(DateTime.makeUnsafe("2026-10-18T12:05:00Z"))).not.toBe(
      timeOf(DateTime.makeUnsafe("2026-10-18T12:10:00Z"))
    )
  })
})
