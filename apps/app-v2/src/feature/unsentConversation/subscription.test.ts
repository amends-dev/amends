import { Group } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { conversationWithBob, general, membership } from "../../../test/fixtures.ts"
import type * as Store from "../../store/Store.ts"
import { Message } from "./definition.ts"
import { receivedConversation } from "./subscription.ts"

const { cases } = ReplicaRecord.ReplicaRecord
const { member } = membership

const bobId = MemberId.MemberId.make("member-2")
const scoutId = MemberId.MemberId.make("member-3")

/** `group` as the store lists it, still on its way when `pending`. */
const listed = (group: Group.Group, pending = false): Store.GroupView => ({
  group: { record: cases.Group.make({ value: group }), pending },
  members: 2
})

/** A conversation of the person with the members `others`. */
const withOthers = (id: string, others: ReadonlyArray<string>) =>
  Schema.decodeSync(Group.Group)({
    id,
    workspaceId: "workspace-1",
    kind: "Direct",
    memberIds: ["member-1", ...others],
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z"
  })

describe("the conversation a conversation not started is told of", () => {
  it("is the one of the person with exactly these people, listed or still on its way", () => {
    expect(receivedConversation([listed(general), listed(conversationWithBob)], member.id, [bobId])).toEqual(
      Message.ReceivedConversation({ groupId: Option.some(conversationWithBob.id) })
    )
    expect(receivedConversation([listed(conversationWithBob, true)], member.id, [bobId])).toEqual(
      Message.ReceivedConversation({ groupId: Option.some(conversationWithBob.id) })
    )
  })

  it("is the one with several people whichever order they are given in", () => {
    const withBobAndScout = withOthers("direct-2", ["member-2", "member-3"])
    const groups = [listed(conversationWithBob), listed(withBobAndScout)]

    for (const others of [
      [bobId, scoutId],
      [scoutId, bobId]
    ]) {
      expect(receivedConversation(groups, member.id, others)).toEqual(
        Message.ReceivedConversation({ groupId: Option.some(withBobAndScout.id) })
      )
    }
  })

  it("is none while the store lists no conversation with exactly them: a team, others, or more people", () => {
    const withMore = withOthers("direct-3", ["member-2", "member-3"])

    expect(receivedConversation([], member.id, [bobId])).toEqual(
      Message.ReceivedConversation({ groupId: Option.none() })
    )
    expect(receivedConversation([listed(general), listed(withMore)], member.id, [bobId])).toEqual(
      Message.ReceivedConversation({ groupId: Option.none() })
    )
  })
})
