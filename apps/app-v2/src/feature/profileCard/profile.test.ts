import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { bob, general, membership, scout, scoutAgent, turnOf } from "../../../test/fixtures.ts"
import type { MemberProfile } from "./definition.ts"
import { readProfile, type Workspace } from "./profile.ts"

const alice = membership.member

const incomplete = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Uninstalled", part: "harness" }] }
})

/** `member` after they left the workspace. */
const removed = (member: Member.Member): Member.Member =>
  Schema.decodeSync(Member.Member)({ ...Schema.encodeSync(Member.Member)(member), status: "removed" })

const workspace: Workspace = {
  members: [alice, bob, scout],
  agents: [{ agent: scoutAgent, pending: false }],
  turns: [],
  groups: [general]
}

const idleAgent: MemberProfile = {
  memberId: scout.id,
  name: "Scout",
  kind: "Agent",
  isYou: false,
  isFormer: false,
  agentId: Option.some(scoutAgent.id),
  readiness: Option.some(scoutAgent.readiness),
  activity: Option.none()
}

describe("a member profile read from the replica", () => {
  it("reads a person with no agent readiness or activity", () => {
    expect(readProfile(bob.id, alice.id, workspace)).toEqual(
      Option.some({
        memberId: bob.id,
        name: "Bob",
        kind: "Person",
        isYou: false,
        isFormer: false,
        agentId: Option.none(),
        readiness: Option.none(),
        activity: Option.none()
      })
    )
  })

  it("is the person themself when they are the one reading", () => {
    expect(readProfile(alice.id, alice.id, workspace)).toEqual(Option.some(expect.objectContaining({ isYou: true })))
    expect(readProfile(bob.id, bob.id, workspace)).toEqual(Option.some(expect.objectContaining({ isYou: true })))
  })

  it("keeps the readiness of an idle agent", () => {
    expect(readProfile(scout.id, alice.id, workspace)).toEqual(Option.some(idleAgent))
  })

  it("keeps an agent’s activity state and places while a turn is under way", () => {
    const working = { ...workspace, turns: [turnOf("turn-1", "running")] }
    const waiting = { ...workspace, turns: [turnOf("turn-1", "queued")] }
    const stopping = { ...workspace, turns: [turnOf("turn-1", "cancelling")] }

    expect(readProfile(scout.id, alice.id, working)).toEqual(
      Option.some({
        ...idleAgent,
        activity: Option.some({ state: "working", places: ["#General"] })
      })
    )
    expect(readProfile(scout.id, alice.id, waiting)).toEqual(
      Option.some(expect.objectContaining({ activity: Option.some({ state: "queued", places: ["#General"] }) }))
    )
    expect(readProfile(scout.id, alice.id, stopping)).toEqual(
      Option.some(expect.objectContaining({ activity: Option.some({ state: "stopping", places: ["#General"] }) }))
    )
  })

  it("keeps incomplete readiness independent of current activity", () => {
    const needing = { ...workspace, agents: [{ agent: incomplete, pending: false }] }

    expect(readProfile(scout.id, alice.id, needing)).toEqual(
      Option.some({
        ...idleAgent,
        readiness: Option.some(incomplete.readiness)
      })
    )
    expect(readProfile(scout.id, alice.id, { ...needing, turns: [turnOf("turn-1", "running")] })).toEqual(
      Option.some(
        expect.objectContaining({
          readiness: Option.some(incomplete.readiness),
          activity: Option.some({ state: "working", places: ["#General"] })
        })
      )
    )
  })

  it("withholds readiness and activity while an agent change is pending", () => {
    const pending = {
      ...workspace,
      agents: [{ agent: scoutAgent, pending: true }],
      turns: [turnOf("turn-1", "running")]
    }

    expect(readProfile(scout.id, alice.id, pending)).toEqual(Option.some({ ...idleAgent, readiness: Option.none() }))
  })

  it("keeps an agent membership with unavailable readiness until the replica holds the agent", () => {
    expect(readProfile(scout.id, alice.id, { ...workspace, agents: [] })).toEqual(
      Option.some({ ...idleAgent, readiness: Option.none() })
    )
  })

  it("keeps a former member’s identity without current readiness or activity", () => {
    const left = {
      ...workspace,
      members: [alice, removed(bob), removed(scout)],
      agents: [{ agent: incomplete, pending: false }],
      turns: [turnOf("turn-1", "running")]
    }

    expect(readProfile(bob.id, alice.id, left)).toEqual(Option.some(expect.objectContaining({ isFormer: true })))
    expect(readProfile(scout.id, alice.id, left)).toEqual(
      Option.some({ ...idleAgent, isFormer: true, readiness: Option.none(), activity: Option.none() })
    )
  })

  it("is none for someone the workspace does not hold", () => {
    expect(readProfile(MemberId.MemberId.make("member-99"), alice.id, workspace)).toEqual(Option.none())
    expect(readProfile(bob.id, alice.id, { ...workspace, members: [] })).toEqual(Option.none())
  })
})
