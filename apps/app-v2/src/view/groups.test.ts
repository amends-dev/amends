import { Group } from "@amends-dev/core/group"
import { describe, expect, it } from "@effect/vitest"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { bob, conversationWithBob, design, general, membership, scout } from "../../test/fixtures.ts"
import { placeName, othersIn, soleOtherIn } from "../data/groups.ts"
import { reasonSubtitle, sideSubtitle, conversationMark } from "./groups.ts"

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

const { member } = membership

const direct = (memberIds: ReadonlyArray<string>) =>
  Schema.decodeSync(Group.Direct)({
    id: "direct-x",
    workspaceId: "workspace-1",
    kind: "Direct",
    memberIds,
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z"
  })

const withBob = direct(["member-1", "member-2"])

describe("a conversation as the sidebar draws it", () => {
  it("is with the members other than the person, and with one member alone when there is one", () => {
    expect(othersIn(withBob, member.id)).toEqual([bob.id])
    expect(soleOtherIn(withBob, member.id)).toEqual(Option.some(bob.id))

    const withSeveral = direct(["member-1", "member-2", "member-3"])

    expect(othersIn(withSeveral, member.id)).toEqual([bob.id, scout.id])
    expect(soleOtherIn(withSeveral, member.id)).toEqual(Option.none())
  })

  it("is marked by the member it is with, in their tone: neutral for a person and lilac for an agent", () => {
    expect(conversationMark([member, bob, scout], withBob, member.id)).toEqual({
      text: "B",
      tone: "neutral"
    })
    expect(conversationMark([member, bob, scout], direct(["member-1", "member-3"]), member.id)).toEqual({
      text: "S",
      tone: "lilac"
    })
  })

  it("is marked by the letters of the member's ID until the workspace's members are read", () => {
    expect(conversationMark([], withBob, member.id)).toEqual({ text: "M" })
  })

  it("is marked, with several members, by the first letters of the names of the first two, on no tone", () => {
    const withSeveral = direct(["member-1", "member-2", "member-3"])

    expect(conversationMark([member, bob, scout], withSeveral, member.id)).toEqual({ text: "BS" })
    expect(
      conversationMark([member, bob, scout], direct(["member-1", "member-2", "member-3", "member-4"]), member.id)
    ).toEqual({ text: "BS" })
  })
})
