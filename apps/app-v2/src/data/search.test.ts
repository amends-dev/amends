import { Group } from "@amends-dev/core/group"
import { ThreadMessage } from "@amends-dev/core/thread"
import { MemberId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  bob,
  conversationWithBob,
  deleted,
  design,
  general,
  membership,
  opening,
  reply,
  saying,
  scout,
  scoutAgent,
  thread
} from "../../test/fixtures.ts"
import { foldAccents, listJumpTargets, type JumpSource } from "./search.ts"

describe("foldAccents", () => {
  it("is the text in lower case with its accents taken off", () => {
    expect(foldAccents("José Ñandú")).toBe("jose nandu")
    expect(foldAccents("ZOË")).toBe("zoe")
    expect(foldAccents("plain")).toBe("plain")
  })
})

describe("listJumpTargets", () => {
  const person = membership.member
  const zoe = { ...bob, id: MemberId.MemberId.make("member-4"), name: "Zoë" }
  const source: JumpSource = {
    memberId: person.id,
    groups: [general, design, conversationWithBob],
    members: [person, bob, zoe, scout],
    threads: [thread],
    messages: [reply, opening]
  }
  const groupNames = (among: JumpSource = source) => listJumpTargets(among).groups.map(({ name }) => name)

  it("lists the groups by the names the person reads, other than a conversation with one other person", () => {
    expect(groupNames()).toEqual(["General", "Design"])
    expect(listJumpTargets(source).groups.map(({ group }) => group.id)).toEqual([general.id, design.id])
  })

  it("keeps a conversation with several people, or with one who is gone, among the groups", () => {
    const withZoe = Schema.decodeSync(Group.Group)({
      id: "alice-bob-and-zoe",
      workspaceId: "workspace-1",
      kind: "Direct",
      memberIds: ["member-1", "member-2", "member-4"],
      createdBy: "member-1",
      createdAt: "2026-10-18T12:00:00Z"
    })
    const goneBob = { ...bob, status: "removed" as const }

    expect(groupNames({ ...source, groups: [withZoe] })).toEqual(["Bob, Zoë"])
    expect(groupNames({ ...source, groups: [conversationWithBob], members: [person, goneBob] })).toEqual(["Bob"])
  })

  it("lists a thread with its group's name and the words it is read by: its title, else its opening's", () => {
    const titled = { ...thread, title: "Weekly sync" as typeof thread.title }

    expect(listJumpTargets(source).threads).toEqual([
      { thread, groupName: "General", words: "Plans for the week", openingWords: Option.some("Plans for the week") }
    ])
    expect(listJumpTargets({ ...source, threads: [titled] }).threads).toEqual([
      { thread: titled, groupName: "General", words: "Weekly sync", openingWords: Option.some("Plans for the week") }
    ])
  })

  it("lists a titled thread whose opening has no words, and leaves out an untitled one", () => {
    const titled = { ...thread, title: "Weekly sync" as typeof thread.title }

    expect(listJumpTargets({ ...source, threads: [titled], messages: [deleted(opening)] }).threads).toEqual([
      { thread: titled, groupName: "General", words: "Weekly sync", openingWords: Option.none() }
    ])
    expect(listJumpTargets({ ...source, messages: [deleted(opening)] }).threads).toEqual([])
    expect(listJumpTargets({ ...source, messages: [] }).threads).toEqual([])
  })

  it("reads a mention in an opening as the member's current name", () => {
    const mentioning = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Bobby")}, look`)

    expect(listJumpTargets({ ...source, messages: [mentioning] }).threads).toMatchObject([{ words: "Hey @Bob, look" }])
  })

  it("reads an opening's words without the syntax of its markdown", () => {
    const formatted = saying(opening, "**Ship** the [retry fix](https://example.com) `now`")

    expect(listJumpTargets({ ...source, messages: [formatted] }).threads).toMatchObject([
      { words: "Ship the retry fix now" }
    ])
  })

  it("leaves out a thread whose group the replica lacks", () => {
    expect(listJumpTargets({ ...source, groups: [design] }).threads).toEqual([])
  })

  it("lists the active people other than the person, and the active agents apart from them", () => {
    const names = (among: JumpSource = source) => listJumpTargets(among).people.map(({ name }) => name)

    expect(names()).toEqual(["Bob", "Zoë"])
    expect(names({ ...source, members: [person, { ...bob, status: "removed" }] })).toEqual([])
    expect(listJumpTargets(source).agents).toEqual([{ agentId: scoutAgent.id, member: scout }])
    expect(listJumpTargets({ ...source, members: [person, { ...scout, status: "removed" }] }).agents).toEqual([])
  })

  it("lists every one in the order of the records, for the search to rank, however many there are", () => {
    const crowd = Array.from({ length: 10 }, (_, index) => ({
      ...bob,
      id: MemberId.MemberId.make(`member-${index + 10}`),
      name: `Sam ${index}`
    }))

    expect(listJumpTargets({ ...source, members: [person, ...crowd] }).people.map(({ name }) => name)).toEqual(
      crowd.map(({ name }) => name)
    )
  })
})
