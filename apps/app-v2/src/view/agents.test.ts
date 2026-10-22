import { ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { scoutAgent } from "../../test/fixtures.ts"
import { readinessOfAgent } from "../data/agents.ts"
import {
  sidebarActivity,
  statusOfAgent,
  activityLabel,
  motionOfState,
  placesLine,
  stateWord,
  turnLabel,
  workingLabel
} from "./agents.ts"

const incomplete = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Uninstalled", part: "harness" }] }
})

const working = Option.some({ state: "working" as const, places: ["#General", "#Design"] })

describe("how an agent stands as a row of the sidebar says it", () => {
  it("is Needs setup, with why, when it can't run as it is set up, whatever it is doing", () => {
    expect(statusOfAgent(readinessOfAgent({ agent: incomplete, pending: false }), Option.none())).toEqual({
      kind: "attention",
      label: "Needs setup",
      detail: "Its harness connection’s integration isn’t installed on this host."
    })
    expect(statusOfAgent(readinessOfAgent({ agent: incomplete, pending: false }), working)).toMatchObject({
      label: "Needs setup"
    })
  })

  it("is where it is at work while it is ready and at work, and nothing while it is idle", () => {
    expect(statusOfAgent(readinessOfAgent({ agent: scoutAgent, pending: false }), working)).toEqual({
      kind: "available",
      label: "Working in #General + 1 more"
    })
    expect(statusOfAgent(readinessOfAgent({ agent: scoutAgent, pending: false }), Option.none())).toBeUndefined()
  })

  it("is nothing while a change to the agent is on its way", () => {
    expect(statusOfAgent(readinessOfAgent({ agent: incomplete, pending: true }), Option.none())).toBeUndefined()
    expect(statusOfAgent(readinessOfAgent({ agent: scoutAgent, pending: true }), working)).toBeUndefined()
  })
})

describe("what a row says of an agent at work", () => {
  it("is the words of its activity and how the logo moves as its state does, and nothing while it is idle", () => {
    expect(sidebarActivity(working)).toEqual({ activity: "Working in #General + 1 more", activityMotion: "working" })
    expect(sidebarActivity(Option.some({ state: "queued" as const, places: [] }))).toEqual({
      activity: "Queued",
      activityMotion: "thread"
    })
    expect(sidebarActivity(Option.none())).toEqual({})
  })
})

describe("agent activity presentation", () => {
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
