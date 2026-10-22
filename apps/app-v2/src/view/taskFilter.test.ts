import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { bob, membership, scout } from "../../test/fixtures.ts"
import { assigneeChoices, assigneeProperties, statusChoices } from "./taskFilter.ts"

const { member } = membership
const left = { ...bob, id: MemberId.MemberId.make("member-9"), name: "Carol", status: "removed" as const }

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

describe("the choices of whom one task is assigned to", () => {
  const everyone = [scout, bob, left, member]

  it("are Unassigned, drawn as the people icon in the button, then each member that can be assigned by name, with their mark", () => {
    expect(assigneeProperties([bob, member], everyone, null)).toEqual([
      { value: "Unassigned", label: "Unassigned", buttonIcon: "users" },
      { value: "Member:member-1", label: "Alice", mark: { text: "A", tone: "neutral" } },
      { value: "Member:member-2", label: "Bob", mark: { text: "B", tone: "neutral" } }
    ])
  })

  it("leave out a member who has left the workspace and one that cannot be assigned", () => {
    expect(assigneeProperties([left, bob], everyone, null).map(({ value }) => value)).toEqual([
      "Unassigned",
      "Member:member-2"
    ])
    expect(assigneeProperties([bob], everyone, null).map(({ value }) => value)).not.toContain("Member:member-3")
  })

  it("keep an assignee who cannot be chosen, such as an agent the person may not use, by their name and mark", () => {
    expect(assigneeProperties([bob], everyone, scout.id)).toEqual([
      { value: "Unassigned", label: "Unassigned", buttonIcon: "users" },
      { value: "Member:member-2", label: "Bob", mark: { text: "B", tone: "neutral" } },
      { value: "Member:member-3", label: "Scout", mark: { text: "S", tone: "lilac" } }
    ])
  })

  it("keep an assignee the members do not know by their ID, with no mark, and list one that can be chosen once", () => {
    const stranger = MemberId.MemberId.make("member-8")

    expect(assigneeProperties([bob], everyone, stranger).at(-1)).toEqual({
      value: "Member:member-8",
      label: "member-8"
    })
    expect(assigneeProperties([bob], everyone, bob.id).map(({ value }) => value)).toEqual([
      "Unassigned",
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
