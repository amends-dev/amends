import { Group } from "@amends-dev/core/group"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { bob, membership, scout } from "../../../test/fixtures.ts"
import { conversationMark, othersIn, soleOtherIn } from "./conversation.ts"

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
