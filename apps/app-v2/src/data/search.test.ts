import { describe, expect, it } from "@effect/vitest"
import { foldAccents } from "./search.ts"

describe("foldAccents", () => {
  it("is the text in lower case with its accents taken off", () => {
    expect(foldAccents("José Ñandú")).toBe("jose nandu")
    expect(foldAccents("ZOË")).toBe("zoe")
    expect(foldAccents("plain")).toBe("plain")
  })
})
