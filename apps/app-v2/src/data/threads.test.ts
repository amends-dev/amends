import { ThreadMessage, ThreadActivity, ThreadParticipation } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Schema } from "effect"
import * as Option from "effect/Option"
import { bob, membership, opening, saying, thread, reply } from "../../test/fixtures.ts"
import {
  threadContains,
  threadWords,
  deriveParticipationChanges,
  summarizeReplies,
  deriveLastActiveAt
} from "./threads.ts"

const members = [membership.member, bob]

describe("threadWords", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

  it("is the title when the thread has one, and the words of the opening without, with a mention as its member's name", () => {
    expect(threadWords({ ...thread, title: "Retro" }, Option.some(asked), members)).toBe("Retro")
    expect(threadWords(thread, Option.some(asked), members)).toBe("@Bob can you check this?")
  })

  it("keeps a title as written and leaves the syntax out of an opening", () => {
    const formatted = saying(opening, "**Ship** the *retry* fix")

    expect(threadWords({ ...thread, title: "*Retro*" }, Option.some(formatted), members)).toBe("*Retro*")
    expect(threadWords(thread, Option.some(formatted), members)).toBe("Ship the retry fix")
  })

  it("is A thread while the opening is not read", () => {
    expect(threadWords(thread, Option.none(), members)).toBe("A thread")
  })
})

describe("threadContains", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the café menu?`)
  const contains = (query: string, titled: string | null = null) =>
    threadContains({ ...thread, title: titled }, Option.some(asked), members, query)

  it("is whether the title has the letters, or the opening's words do, in any case and whatever the accents", () => {
    expect(contains("RETRO", "Retro")).toBe(true)
    expect(contains("check")).toBe(true)
    expect(contains("CAFE")).toBe(true)
    expect(contains("retro")).toBe(false)
  })

  it("finds a title and an opening alike, as the person reads the opening's mention: the member's current name", () => {
    expect(contains("retro", "Retro")).toBe(true)
    expect(contains("check", "Retro")).toBe(true)
    expect(contains("@bob")).toBe(true)
    expect(contains("robert")).toBe(false)
  })

  it("reads the opening's words without the syntax of its markdown", () => {
    const formatted = saying(opening, "**Ship** the [retry fix](https://example.com) `now`")
    const containsFormatted = (query: string) => threadContains(thread, Option.some(formatted), members, query)

    expect(containsFormatted("ship the retry fix now")).toBe(true)
    expect(containsFormatted("**")).toBe(false)
    expect(containsFormatted("example.com")).toBe(false)
    expect(containsFormatted("`now`")).toBe(false)
  })

  it("leaves out the spaces around the letters, and keeps every thread for none", () => {
    expect(contains("  menu ")).toBe(true)
    expect(contains("")).toBe(true)
    expect(contains("   ")).toBe(true)
    expect(contains("  nothing like it ")).toBe(false)
  })

  it("has no words to find while the opening is not read and the thread has no title", () => {
    expect(threadContains(thread, Option.none(), members, "check")).toBe(false)
    expect(threadContains(thread, Option.none(), members, "")).toBe(true)
    expect(threadContains({ ...thread, title: "Retro" }, Option.none(), members, "retro")).toBe(true)
  })
})

describe("deriveParticipationChanges", () => {
  const activity = (id: string, sequence: number, kind: string, details: Schema.Json) =>
    Schema.decodeSync(ThreadActivity.ThreadActivity)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      sequence,
      occurredAt: `2026-10-18T12:${String(sequence).padStart(2, "0")}:00Z`,
      kind,
      version: 1,
      subject: "thread-participation:participation-2",
      occurrence: null,
      newActivity: false,
      details
    })
  const participation = (id: string, participant: (typeof ThreadParticipation.Participant)["Encoded"]) =>
    Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      participant,
      joinedAt: "2026-10-18T12:00:00Z",
      joinedAtSequence: 1,
      status: "active",
      endedAt: null
    })
  const bobsParticipation = participation("participation-2", {
    _tag: "Member",
    memberId: "member-2",
    groupMembershipId: "membership-2",
    identity: { _tag: "Human", id: "bob" }
  })
  const followed = (id: string, sequence: number) =>
    activity(id, sequence, "participation.followed", { participationId: "participation-2" })
  const ended = (id: string, sequence: number, reason: string) =>
    activity(id, sequence, "participation.ended", { participationId: "participation-2", reason })
  const changesOf = (activities: ReadonlyArray<ThreadActivity.ThreadActivity>) =>
    deriveParticipationChanges(activities, [
      bobsParticipation,
      participation("participation-contact", { _tag: "Contact", contactId: "contact-1" })
    ]).map(({ id, change, memberId }) => [id, change, memberId])

  it("notes a follow and each way a participation ended, in the order of the thread, for the member whose part it was", () => {
    expect(
      changesOf([
        ended("activity-5", 5, "workspace-removed"),
        followed("activity-1", 1),
        ended("activity-2", 2, "unfollowed"),
        ended("activity-3", 3, "group-left"),
        ended("activity-4", 4, "group-removed")
      ])
    ).toEqual([
      ["activity-1", "followed", "member-2"],
      ["activity-2", "unfollowed", "member-2"],
      ["activity-3", "left-group", "member-2"],
      ["activity-4", "removed-from-group", "member-2"],
      ["activity-5", "removed-from-workspace", "member-2"]
    ])
  })

  it("says when each was made", () => {
    expect(deriveParticipationChanges([followed("activity-1", 7)], [bobsParticipation]).map(({ at }) => at)).toEqual([
      DateTime.makeUnsafe("2026-10-18T12:07:00Z")
    ])
  })

  it("notes nothing for other activity, a kind whose details do not read, or a participation that is not a member's", () => {
    expect(
      changesOf([
        activity("activity-1", 1, "message.posted", { messageId: "message-1" }),
        activity("activity-2", 2, "participation.ended", { participationId: "participation-2", reason: "unknown" }),
        activity("activity-3", 3, "participation.followed", { participationId: "participation-contact" }),
        activity("activity-4", 4, "participation.followed", { participationId: "participation-missing" })
      ])
    ).toEqual([])
  })
})

describe("summarizeReplies", () => {
  const written = (id: string, author: typeof ThreadMessage.Author.Encoded, minute: number) =>
    Schema.decodeSync(ThreadMessage.ThreadMessage)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      author,
      via: null,
      publishedAt: `2026-10-18T12:0${minute}:00Z`,
      content: { _tag: "Text", text: id, mentions: [], revision: 1, editedAt: null }
    })
  const alice = { _tag: "Member", memberId: "member-1" } as const
  const bob = { _tag: "Member", memberId: "member-2" } as const
  const dana = { _tag: "Contact", contactId: "contact-1" } as const

  it("finds no replies in a thread that has none, or no messages yet", () => {
    expect(summarizeReplies([])).toEqual({ replies: 0, repliers: [] })
    expect(summarizeReplies([written("message-1", alice, 0)])).toEqual({ replies: 0, repliers: [] })
  })

  it("counts the messages after the opening, and names their authors once each, in the order of their first reply", () => {
    const messages = [
      written("message-1", alice, 0),
      written("message-2", bob, 1),
      written("message-3", dana, 2),
      written("message-4", bob, 3),
      written("message-5", alice, 4)
    ]

    const decode = Schema.decodeSync(ThreadMessage.Author)

    expect(summarizeReplies(messages)).toEqual({
      replies: 4,
      repliers: [decode(bob), decode(dana), decode(alice)]
    })
  })
})

describe("deriveLastActiveAt", () => {
  it("is when the thread was created while it has no messages", () => {
    expect(deriveLastActiveAt(thread, [])).toEqual(thread.createdAt)
  })

  it("is when the latest message was published, which a thread with two is the later of", () => {
    expect(deriveLastActiveAt(thread, [opening])).toEqual(opening.publishedAt)
    expect(deriveLastActiveAt(thread, [opening, reply])).toEqual(reply.publishedAt)
    expect(reply.publishedAt).not.toEqual(opening.publishedAt)
  })
})
