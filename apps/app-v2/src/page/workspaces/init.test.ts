import { describe, expect, it } from "@effect/vitest"
import { suggestNameFromEmail } from "./init.ts"

describe("suggestNameFromEmail", () => {
  it("is the part of the address before the @ with its first letter in capitals", () => {
    expect(suggestNameFromEmail("dave@example.com")).toBe("Dave")
    expect(suggestNameFromEmail("Alex@mercier.example")).toBe("Alex")
    expect(suggestNameFromEmail("dave.smith@example.com")).toBe("Dave.smith")
    expect(suggestNameFromEmail("éclair@example.com")).toBe("Éclair")
  })

  it("is nothing for an address with nothing before the @, and for none", () => {
    expect(suggestNameFromEmail("@example.com")).toBe("")
    expect(suggestNameFromEmail("")).toBe("")
  })
})
