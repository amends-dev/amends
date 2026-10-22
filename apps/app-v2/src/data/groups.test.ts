import { Group, GroupId } from "@amends-dev/core/group"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { bob, general, membership, scout } from "../../test/fixtures.ts"
import { conversationAmong } from "./groups.ts"

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
