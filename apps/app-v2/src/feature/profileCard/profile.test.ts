import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { bob, general, membership, scout, scoutAgent, turnOf } from "../../../test/fixtures.ts"
import type { MemberProfile } from "./definition.ts"
import { readProfile, shownProfile, type Workspace } from "./profile.ts"

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
  standing: Option.none(),
  motion: Option.none()
}

describe("a member as their card shows them", () => {
  it("is a person by their name, who is not the one reading, and stands as no agent does", () => {
    expect(readProfile(bob.id, alice.id, workspace)).toEqual(
      Option.some({
        memberId: bob.id,
        name: "Bob",
        kind: "Person",
        isYou: false,
        isFormer: false,
        agentId: Option.none(),
        standing: Option.none(),
        motion: Option.none()
      })
    )
  })

  it("is the person themself when they are the one reading", () => {
    expect(readProfile(alice.id, alice.id, workspace)).toEqual(Option.some(expect.objectContaining({ isYou: true })))
    expect(readProfile(bob.id, bob.id, workspace)).toEqual(Option.some(expect.objectContaining({ isYou: true })))
  })

  it("is an agent that is ready and idle by its agent, with no standing and a still logo", () => {
    expect(readProfile(scout.id, alice.id, workspace)).toEqual(Option.some(idleAgent))
  })

  it("is an agent at work by where, as its mark says it, with its logo moving as its turn does", () => {
    const working = { ...workspace, turns: [turnOf("turn-1", "running")] }
    const waiting = { ...workspace, turns: [turnOf("turn-1", "queued")] }
    const stopping = { ...workspace, turns: [turnOf("turn-1", "cancelling")] }

    expect(readProfile(scout.id, alice.id, working)).toEqual(
      Option.some({
        ...idleAgent,
        standing: Option.some({ kind: "available", label: "Working in #General", detail: Option.none() }),
        motion: Option.some("working")
      })
    )
    expect(readProfile(scout.id, alice.id, waiting)).toEqual(
      Option.some(expect.objectContaining({ motion: Option.some("thread") }))
    )
    expect(readProfile(scout.id, alice.id, stopping)).toEqual(
      Option.some(expect.objectContaining({ motion: Option.some("tug") }))
    )
  })

  it("is an agent that needs setup by why, whatever it is doing, with its logo moving while it is at work", () => {
    const needing = { ...workspace, agents: [{ agent: incomplete, pending: false }] }

    expect(readProfile(scout.id, alice.id, needing)).toEqual(
      Option.some({
        ...idleAgent,
        standing: Option.some({
          kind: "attention",
          label: "Needs setup",
          detail: Option.some("Its harness connection’s integration isn’t installed on this host.")
        })
      })
    )
    expect(readProfile(scout.id, alice.id, { ...needing, turns: [turnOf("turn-1", "running")] })).toEqual(
      Option.some(
        expect.objectContaining({
          standing: Option.some(expect.objectContaining({ label: "Needs setup" })),
          motion: Option.some("working")
        })
      )
    )
  })

  it("is an agent with no standing and a still logo while a change to it is on its way", () => {
    const pending = {
      ...workspace,
      agents: [{ agent: scoutAgent, pending: true }],
      turns: [turnOf("turn-1", "running")]
    }

    expect(readProfile(scout.id, alice.id, pending)).toEqual(Option.some(idleAgent))
  })

  it("is an agent with no standing until the replica holds it", () => {
    expect(readProfile(scout.id, alice.id, { ...workspace, agents: [] })).toEqual(Option.some(idleAgent))
  })

  it("is a former member by their name, with the standing and the motion of no one", () => {
    const left = {
      ...workspace,
      members: [alice, removed(bob), removed(scout)],
      agents: [{ agent: incomplete, pending: false }],
      turns: [turnOf("turn-1", "running")]
    }

    expect(readProfile(bob.id, alice.id, left)).toEqual(Option.some(expect.objectContaining({ isFormer: true })))
    expect(readProfile(scout.id, alice.id, left)).toEqual(
      Option.some({ ...idleAgent, isFormer: true, standing: Option.none(), motion: Option.none() })
    )
  })

  it("is none for someone the workspace does not hold", () => {
    expect(readProfile(MemberId.MemberId.make("member-99"), alice.id, workspace)).toEqual(Option.none())
    expect(readProfile(bob.id, alice.id, { ...workspace, members: [] })).toEqual(Option.none())
  })
})

describe("a member as the design draws their card", () => {
  it("has the letters of their name on the slate ground of a person and the lilac of an agent", () => {
    expect(shownProfile({ ...idleAgent, name: "Alex Morgan", kind: "Person", agentId: Option.none() })).toMatchObject({
      name: "Alex Morgan",
      mark: { text: "AM", tone: "slate" },
      kind: "Person"
    })
    expect(shownProfile(idleAgent)).toMatchObject({ name: "Scout", mark: { text: "S", tone: "lilac" }, kind: "Agent" })
  })

  it("says whether they are the reader and whether they left", () => {
    expect(shownProfile({ ...idleAgent, isYou: true, isFormer: true })).toMatchObject({ isYou: true, isFormer: true })
    expect(shownProfile(idleAgent)).toMatchObject({ isYou: false, isFormer: false })
  })

  it("has a standing as the mark's status, with why only when there is one, and the motion of the logo", () => {
    expect(
      shownProfile({
        ...idleAgent,
        standing: Option.some({ kind: "attention", label: "Needs setup", detail: Option.some("Why.") }),
        motion: Option.some("thread")
      })
    ).toMatchObject({ status: { kind: "attention", label: "Needs setup", detail: "Why." }, motion: "thread" })

    const working = shownProfile({
      ...idleAgent,
      standing: Option.some({ kind: "available", label: "Working", detail: Option.none() })
    })

    expect(working.status).toEqual({ kind: "available", label: "Working" })
    expect(shownProfile(idleAgent).status).toBeUndefined()
    expect(shownProfile(idleAgent).motion).toBeUndefined()
  })
})
