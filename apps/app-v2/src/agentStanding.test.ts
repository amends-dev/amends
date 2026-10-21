import { ReplicaRecord } from "@amends-dev/core/replica"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { scoutAgent } from "../test/fixtures.ts"
import { sidebarActivity, statusOfAgent } from "./agentStanding.ts"

const incomplete = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Uninstalled", part: "harness" }] }
})

const working = Option.some({ state: "working" as const, places: ["#General", "#Design"] })

describe("how an agent stands as a row of the sidebar says it", () => {
  it("is Needs setup, with why, when it can't run as it is set up, whatever it is doing", () => {
    expect(statusOfAgent({ agent: incomplete, pending: false }, Option.none())).toEqual({
      kind: "attention",
      label: "Needs setup",
      detail: "Its harness connection’s integration isn’t installed on this host."
    })
    expect(statusOfAgent({ agent: incomplete, pending: false }, working)).toMatchObject({ label: "Needs setup" })
  })

  it("is where it is at work while it is ready and at work, and nothing while it is idle", () => {
    expect(statusOfAgent({ agent: scoutAgent, pending: false }, working)).toEqual({
      kind: "available",
      label: "Working in #General + 1 more"
    })
    expect(statusOfAgent({ agent: scoutAgent, pending: false }, Option.none())).toBeUndefined()
  })

  it("is nothing while a change to the agent is on its way", () => {
    expect(statusOfAgent({ agent: incomplete, pending: true }, Option.none())).toBeUndefined()
    expect(statusOfAgent({ agent: scoutAgent, pending: true }, working)).toBeUndefined()
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
