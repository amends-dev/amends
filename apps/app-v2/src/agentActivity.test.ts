import { Identity } from "@amends-dev/core/identity"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import { bob, conversationWithBob, design, general, membership, now, scout, turnOf } from "../test/fixtures.ts"
import {
  activityLabel,
  activityOf,
  activityStateOf,
  agentsAtWork,
  motionOfState,
  placesLine,
  stateWord,
  turnLabel,
  turnsUnderWay,
  workingLabel
} from "./agentActivity.ts"

const { member } = membership
const scoutId = Identity.AgentId.make("agent-1")
const otherAgentId = Identity.AgentId.make("agent-2")
const members = [member, bob, scout]
const groups = [general, design, conversationWithBob]

/** Scout's turn `id` in `status`, in the group `groupId`, created `minutes` after the time now. */
const scoutsTurn = (id: string, status: Parameters<typeof turnOf>[1], groupId = general.id, minutes = 2) => ({
  ...turnOf(id, status),
  groupId,
  createdAt: DateTime.add(now, { minutes })
})

const underWay = (turns: ReadonlyArray<ReturnType<typeof scoutsTurn>>, agentId = scoutId) =>
  turnsUnderWay(agentId, turns, groups, members, member.id)

describe("the state of a turn", () => {
  it("is queued while it waits, working while it runs, and stopping while it is asked to stop, and none once it finished", () => {
    expect(activityStateOf("queued")).toEqual(Option.some("queued"))
    expect(activityStateOf("running")).toEqual(Option.some("working"))
    expect(activityStateOf("cancelling")).toEqual(Option.some("stopping"))
    expect(activityStateOf("completed")).toEqual(Option.none())
    expect(activityStateOf("failed")).toEqual(Option.none())
    expect(activityStateOf("cancelled")).toEqual(Option.none())
  })

  it("is told in a word, and moves the logo as it does: threaded while queued, lit while working, tugged while stopping", () => {
    expect(stateWord).toEqual({ queued: "Queued", working: "Working", stopping: "Stopping" })
    expect(motionOfState).toEqual({ queued: "thread", working: "working", stopping: "tug" })
  })
})

describe("what a line says of an agent at work", () => {
  it("is the agent's name and its state in a word of its own, as a line says it", () => {
    expect(workingLabel("Yumi", "working")).toBe("Yumi working")
    expect(workingLabel("Atlas", "queued")).toBe("Atlas queued")
    expect(workingLabel("Scout", "stopping")).toBe("Scout stopping")
  })
})

describe("the agents at work in a thread", () => {
  const reviewersTurn = (id: string, status: Parameters<typeof turnOf>[1], minutes: number) => ({
    ...scoutsTurn(id, status, general.id, minutes),
    memberId: MemberId.MemberId.make("member-6")
  })

  it("are none for a thread with no turn, or whose turns all finished", () => {
    expect(agentsAtWork([])).toEqual([])
    expect(agentsAtWork([scoutsTurn("turn-1", "completed"), scoutsTurn("turn-2", "failed")])).toEqual([])
    expect(agentsAtWork([scoutsTurn("turn-3", "cancelled")])).toEqual([])
  })

  it("are the members of the turns that are queued, running, or stopping, each in the state its turn is in", () => {
    expect(agentsAtWork([scoutsTurn("turn-1", "queued")])).toEqual([{ memberId: scout.id, state: "queued" }])
    expect(agentsAtWork([scoutsTurn("turn-1", "running")])).toEqual([{ memberId: scout.id, state: "working" }])
    expect(agentsAtWork([scoutsTurn("turn-1", "cancelling")])).toEqual([{ memberId: scout.id, state: "stopping" }])
  })

  it("leave out an agent's turns that finished, and list the agents oldest turn first, whatever order they come in", () => {
    expect(
      agentsAtWork([
        reviewersTurn("turn-3", "running", 5),
        scoutsTurn("turn-2", "running", general.id, 3),
        scoutsTurn("turn-1", "completed", general.id, 1)
      ])
    ).toEqual([
      { memberId: scout.id, state: "working" },
      { memberId: MemberId.MemberId.make("member-6"), state: "working" }
    ])
  })
})

describe("an agent's turns under way", () => {
  it("are none for an agent with no turn, or whose turns all finished", () => {
    expect(underWay([])).toEqual([])
    expect(
      underWay([scoutsTurn("turn-1", "completed"), scoutsTurn("turn-2", "failed"), scoutsTurn("turn-3", "cancelled")])
    ).toEqual([])
  })

  it("are only the agent's own, each in the place its group is named by", () => {
    const strangers = { ...scoutsTurn("turn-9", "running"), agentId: otherAgentId }

    expect(underWay([strangers, scoutsTurn("turn-1", "running", design.id)])).toEqual([
      { turnId: "turn-1", groupId: design.id, threadId: "thread-1", state: "working", place: Option.some("#Design") }
    ])
    expect(underWay([scoutsTurn("turn-1", "queued", conversationWithBob.id)])).toEqual([
      {
        turnId: "turn-1",
        groupId: conversationWithBob.id,
        threadId: "thread-1",
        state: "queued",
        place: Option.some("Bob")
      }
    ])
  })

  it("carry the group and the thread each turn works in, which opens it", () => {
    const inAnotherThread = {
      ...scoutsTurn("turn-1", "running", design.id),
      threadId: ThreadId.ThreadId.make("thread-2")
    }

    expect(underWay([inAnotherThread, scoutsTurn("turn-2", "queued", general.id)])).toMatchObject([
      { turnId: "turn-1", groupId: design.id, threadId: "thread-2" },
      { turnId: "turn-2", groupId: general.id, threadId: "thread-1" }
    ])
  })

  it("are the most pressing first, working, then stopping, then queued, and the oldest first within a state", () => {
    const turns = [
      scoutsTurn("queued-late", "queued", general.id, 9),
      scoutsTurn("stopping", "cancelling", design.id, 5),
      scoutsTurn("working-late", "running", design.id, 8),
      scoutsTurn("queued-early", "queued", general.id, 3),
      scoutsTurn("working-early", "running", general.id, 4)
    ]

    expect(underWay(turns).map(({ turnId, state }) => [turnId, state])).toEqual([
      ["working-early", "working"],
      ["working-late", "working"],
      ["stopping", "stopping"],
      ["queued-early", "queued"],
      ["queued-late", "queued"]
    ])
  })

  it("have no place while the store lacks their group", () => {
    expect(underWay([scoutsTurn("turn-1", "running", general.id)]).map(({ place }) => place)).toEqual([
      Option.some("#General")
    ])
    expect(
      turnsUnderWay(scoutId, [scoutsTurn("turn-1", "running")], [], members, member.id).map(({ place }) => place)
    ).toEqual([Option.none()])
  })

  it("name a conversation by the others in it as the person reads it", () => {
    const asBob = turnsUnderWay(
      scoutId,
      [scoutsTurn("turn-1", "running", conversationWithBob.id)],
      groups,
      members,
      MemberId.MemberId.make("member-2")
    )

    expect(asBob.map(({ place }) => place)).toEqual([Option.some("Alice")])
  })
})

describe("an agent's activity", () => {
  it("is none while it has no turn under way: the agent is idle", () => {
    expect(activityOf(underWay([]))).toEqual(Option.none())
    expect(activityOf(underWay([scoutsTurn("turn-1", "completed")]))).toEqual(Option.none())
  })

  it("is waiting while its only turn is queued, working while one runs, and stopping while the only one is asked to stop", () => {
    expect(activityOf(underWay([scoutsTurn("turn-1", "queued")]))).toEqual(
      Option.some({ state: "queued", places: ["#General"] })
    )
    expect(activityOf(underWay([scoutsTurn("turn-1", "running", design.id)]))).toEqual(
      Option.some({ state: "working", places: ["#Design"] })
    )
    expect(activityOf(underWay([scoutsTurn("turn-1", "cancelling")]))).toEqual(
      Option.some({ state: "stopping", places: ["#General"] })
    )
  })

  it("takes the most pressing state of its turns, and each place they are in, once, the most pressing turn's first", () => {
    const activity = activityOf(
      underWay([
        scoutsTurn("turn-1", "queued", general.id),
        scoutsTurn("turn-2", "running", design.id),
        scoutsTurn("turn-3", "running", general.id),
        scoutsTurn("turn-4", "queued", conversationWithBob.id)
      ])
    )

    expect(activity).toEqual(Option.some({ state: "working", places: ["#Design", "#General", "Bob"] }))
  })

  it("is a state alone while no place is read", () => {
    expect(activityOf(turnsUnderWay(scoutId, [scoutsTurn("turn-1", "running")], [], members, member.id))).toEqual(
      Option.some({ state: "working", places: [] })
    )
  })
})

describe("the words for what an agent is doing", () => {
  it("name one place as it is, and more than one by the first and how many follow", () => {
    expect(placesLine([])).toBe("")
    expect(placesLine(["#general"])).toBe("#general")
    expect(placesLine(["#general", "#design"])).toBe("#general + 1 more")
    expect(placesLine(["#general", "#design", "Bob"])).toBe("#general + 2 more")
  })

  it("say the state in the places, or the state alone while no place is read", () => {
    expect(activityLabel({ state: "working", places: ["#general"] })).toBe("Working in #general")
    expect(activityLabel({ state: "queued", places: ["#general", "#design"] })).toBe("Queued in #general + 1 more")
    expect(activityLabel({ state: "stopping", places: [] })).toBe("Stopping")
  })

  it("say a turn's state in its place", () => {
    expect(turnLabel({ state: "queued", place: Option.some("#design") })).toBe("Queued in #design")
    expect(turnLabel({ state: "working", place: Option.none() })).toBe("Working")
  })
})
