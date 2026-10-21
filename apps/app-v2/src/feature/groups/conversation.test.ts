import { Group, GroupId } from "@amends-dev/core/group"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { bob, general, membership, scout } from "../../../test/fixtures.ts"
import { conversationAmong, conversationMark, othersIn, soleOtherIn } from "./conversation.ts"

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

describe("the conversation of the person with exactly some members", () => {
  const withScout = direct(["member-1", "member-3"])
  const withBobAndScout = { ...direct(["member-1", "member-2", "member-3"]), id: GroupId.GroupId.make("direct-y") }
  const groups = [withBob, withScout, withBobAndScout]

  it("is the one whose members are the person and those, whatever order those are given in", () => {
    expect(Option.map(conversationAmong(groups, member.id, [bob.id]), ({ id }) => id)).toEqual(Option.some(withBob.id))
    expect(Option.map(conversationAmong(groups, member.id, [scout.id]), ({ id }) => id)).toEqual(
      Option.some(withScout.id)
    )
    expect(Option.map(conversationAmong(groups, member.id, [scout.id, bob.id]), ({ id }) => id)).toEqual(
      Option.some(withBobAndScout.id)
    )
    expect(Option.map(conversationAmong(groups, member.id, [bob.id, scout.id]), ({ id }) => id)).toEqual(
      Option.some(withBobAndScout.id)
    )
  })

  it("is none for some of those people alone, for more people than those, and for a team of them", () => {
    expect(conversationAmong([withBobAndScout], member.id, [bob.id])).toEqual(Option.none())
    expect(conversationAmong([withBob], member.id, [bob.id, scout.id])).toEqual(Option.none())
    expect(conversationAmong([withBob], member.id, [MemberId.MemberId.make("member-4")])).toEqual(Option.none())
    expect(conversationAmong([general], member.id, [bob.id])).toEqual(Option.none())
    expect(conversationAmong([], member.id, [bob.id])).toEqual(Option.none())
  })
})

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
