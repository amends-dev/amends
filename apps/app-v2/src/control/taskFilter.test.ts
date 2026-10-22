import { describe, expect, it } from "@effect/vitest"
import { bob, membership } from "../../test/fixtures.ts"
import { AssigneeFilter, assigneeChoiceOf, assigneeFilterOf, assigneeOfChoice, isAssignedTo } from "./taskFilter.ts"

const { member } = membership

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

describe("whom the assignee menu assigns a task to", () => {
  it("is the member a choice names, and no one for Unassigned", () => {
    expect(assigneeOfChoice("Member:member-2")).toBe(bob.id)
    expect(assigneeOfChoice("Unassigned")).toBeNull()
  })

  it("is no one for Anyone, which only narrows a list", () => {
    expect(assigneeOfChoice("Anyone")).toBeNull()
  })
})
