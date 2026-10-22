import { describe, expect, it } from "@effect/vitest"
import { pluralize, repliesLabel } from "./counts.ts"

describe("pluralize", () => {
  it("says the count with the singular for one, and with the plural for any other number", () => {
    expect(pluralize(1, "member", "members")).toBe("1 member")
    expect(pluralize(0, "member", "members")).toBe("0 members")
    expect(pluralize(12, "member", "members")).toBe("12 members")
    expect(pluralize(2, "reply", "replies")).toBe("2 replies")
  })
})

describe("repliesLabel", () => {
  it("says 1 reply for one, and the number of replies for any other number", () => {
    expect(repliesLabel(1)).toBe("1 reply")
    expect(repliesLabel(2)).toBe("2 replies")
    expect(repliesLabel(12)).toBe("12 replies")
  })
})
