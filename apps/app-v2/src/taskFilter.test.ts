import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { bob, membership, scout } from "../test/fixtures.ts"
import {
  AssigneeFilter,
  assigneeChoiceOf,
  assigneeChoices,
  assigneeFilterOf,
  isAssignedTo,
  statusChoices
} from "./taskFilter.ts"

const { member } = membership
const left = { ...bob, id: MemberId.MemberId.make("member-9"), name: "Carol", status: "removed" as const }

describe("the assignee a list is narrowed to", () => {
  it("is named for the menu by a word for anyone and no one, and by the member's ID for a member", () => {
    expect(assigneeChoiceOf(AssigneeFilter.Anyone())).toBe("Anyone")
    expect(assigneeChoiceOf(AssigneeFilter.Unassigned())).toBe("Unassigned")
    expect(assigneeChoiceOf(AssigneeFilter.Member({ memberId: bob.id }))).toBe("Member:member-2")
  })

  it("is read back from the menu's choice as it was named", () => {
    for (const filter of [
      AssigneeFilter.Anyone(),
      AssigneeFilter.Unassigned(),
      AssigneeFilter.Member({ memberId: bob.id })
    ]) {
      expect(assigneeFilterOf(assigneeChoiceOf(filter))).toEqual(filter)
    }
  })

  it("keeps the tasks a filter names: all of them, those of no one, or those of one member", () => {
    expect(isAssignedTo(AssigneeFilter.Anyone(), null)).toBe(true)
    expect(isAssignedTo(AssigneeFilter.Anyone(), bob.id)).toBe(true)
    expect(isAssignedTo(AssigneeFilter.Unassigned(), null)).toBe(true)
    expect(isAssignedTo(AssigneeFilter.Unassigned(), bob.id)).toBe(false)
    expect(isAssignedTo(AssigneeFilter.Member({ memberId: bob.id }), bob.id)).toBe(true)
    expect(isAssignedTo(AssigneeFilter.Member({ memberId: bob.id }), member.id)).toBe(false)
    expect(isAssignedTo(AssigneeFilter.Member({ memberId: bob.id }), null)).toBe(false)
  })
})

describe("the choices of whom a task is assigned to", () => {
  it("are Anyone, Unassigned, then each member still in the workspace by name, with their mark", () => {
    expect(assigneeChoices([scout, bob, left, member])).toEqual([
      ["Anyone", "Anyone"],
      ["Unassigned", "Unassigned"],
      ["Member:member-1", "Alice", { text: "A", tone: "neutral" }],
      ["Member:member-2", "Bob", { text: "B", tone: "neutral" }],
      ["Member:member-3", "Scout", { text: "S", tone: "lilac" }]
    ])
  })

  it("are only Anyone and Unassigned while the members are not read", () => {
    expect(assigneeChoices([]).map(([choice]) => choice)).toEqual(["Anyone", "Unassigned"])
  })

  it("put members of one name in the order of their IDs", () => {
    const twin = { ...bob, id: MemberId.MemberId.make("member-0") }

    expect(assigneeChoices([bob, twin]).map(([choice]) => choice)).toEqual([
      "Anyone",
      "Unassigned",
      "Member:member-0",
      "Member:member-2"
    ])
  })
})

describe("the choices of a status", () => {
  it("are Any status, then each of the statuses given as the person reads it", () => {
    expect(statusChoices(["todo", "done"])).toEqual([
      ["All", "Any status"],
      ["todo", "To do"],
      ["done", "Done"]
    ])
  })
})
