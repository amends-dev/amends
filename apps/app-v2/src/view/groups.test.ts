import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import { bob, conversationWithBob, design, general, membership } from "../../test/fixtures.ts"
import { placeName } from "../data/groups.ts"
import { reasonSubtitle, sideSubtitle } from "./groups.ts"

describe("where a group is", () => {
  const members = [membership.member, bob]
  const self = membership.member.id

  it("is said as a line says it: a team as # and its name, a conversation by the others in it", () => {
    expect(placeName(design, members, self)).toBe("#Design")
    expect(placeName(conversationWithBob, members, self)).toBe("Bob")
  })

  it("is said by the side pane's subtitle as the thread in a team and with the others in a conversation, or only as a thread while the group is not read", () => {
    expect(sideSubtitle("Thread", Option.some(general), members, self)).toBe("Thread in #General")
    expect(sideSubtitle("Thread", Option.some(conversationWithBob), members, self)).toBe("Thread with Bob")
    expect(sideSubtitle("Thread", Option.none(), members, self)).toBe("Thread")
  })

  it("is said by the side pane's subtitle the same way for a task", () => {
    expect(sideSubtitle("Task", Option.some(general), members, self)).toBe("Task in #General")
    expect(sideSubtitle("Task", Option.some(conversationWithBob), members, self)).toBe("Task with Bob")
    expect(sideSubtitle("Task", Option.none(), members, self)).toBe("Task")
  })

  it("is said by the subtitle of a thread the person came to for a reason, after the reason", () => {
    expect(reasonSubtitle("Mention", Option.some(general), members, self)).toBe("Mention · #General")
    expect(reasonSubtitle("Reply", Option.some(conversationWithBob), members, self)).toBe("Reply · Bob")
    expect(reasonSubtitle("New thread", Option.none(), members, self)).toBe("New thread")
  })
})
