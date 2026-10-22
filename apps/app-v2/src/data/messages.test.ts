import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import { bob, deleted, membership, opening, reply, saying, scout, thread } from "../../test/fixtures.ts"
import { messageWords, authorMemberId, isAuthorAgent, typingNames } from "./messages.ts"

const members = [membership.member, bob]

describe("messageWords", () => {
  it("is the words of what a message says in one line, a mention as the name its member has now", () => {
    const asked = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Robert")}, look`)

    expect(messageWords(asked, members)).toBe("Hey @Bob, look")
    expect(messageWords(reply, members)).toBe("Sounds good")
  })

  it("is the name a mention recorded while its member is not among the members", () => {
    const asked = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Robert")}, look`)

    expect(messageWords(asked, [membership.member])).toBe("Hey @Robert, look")
  })

  it("leaves out the syntax of the markdown, and keeps its words", () => {
    const formatted = saying(
      opening,
      "# Plan\n\n**Ship** it, [the notes](https://example.com) and `retry`:\n\n- one\n- two\n\n> soon\n\n```\nrun\n```"
    )

    expect(messageWords(formatted, members)).toBe("Plan Ship it, the notes and retry: one two soon run")
  })

  it("says a deleted message was deleted", () => {
    expect(messageWords(deleted(reply), members)).toBe("Message deleted")
  })
})

describe("isAuthorAgent", () => {
  it("is true for a member that is an agent, and false for a person, an unknown member, and a contact", () => {
    const members = [membership.member, bob, scout]

    expect(isAuthorAgent(ThreadMessage.Author.cases.Member.make({ memberId: scout.id }), members)).toBe(true)
    expect(isAuthorAgent(ThreadMessage.Author.cases.Member.make({ memberId: bob.id }), members)).toBe(false)
    expect(isAuthorAgent(ThreadMessage.Author.cases.Member.make({ memberId: scout.id }), [bob])).toBe(false)
    expect(isAuthorAgent(ThreadMessage.Author.cases.Contact.make({ contactId: "contact-1" as never }), members)).toBe(
      false
    )
  })
})

describe("authorMemberId", () => {
  it("is the member who wrote it, and none for a contact of a channel, who has no card to open", () => {
    expect(authorMemberId(ThreadMessage.Author.cases.Member.make({ memberId: bob.id }))).toBe(bob.id)
    expect(authorMemberId(ThreadMessage.Author.cases.Contact.make({ contactId: "contact-1" as never }))).toBeUndefined()
  })
})

describe("typingNames", () => {
  const members = [membership.member, bob, scout]
  const present = [
    { memberId: bob.id, typingIn: thread.id },
    { memberId: scout.id, typingIn: thread.id },
    { memberId: membership.member.id, typingIn: thread.id }
  ]

  it("are those present who type in the thread, other than the person, by their names, in the order given", () => {
    expect(typingNames(present, thread.id, membership.member.id, members)).toEqual(["Bob", "Scout"])
  })

  it("leave out those typing in another thread, or in none", () => {
    expect(
      typingNames(
        [
          { memberId: bob.id, typingIn: ThreadId.ThreadId.make("thread-9") },
          { memberId: scout.id, typingIn: null }
        ],
        thread.id,
        membership.member.id,
        members
      )
    ).toEqual([])
  })

  it("call a member whose name is not read Someone", () => {
    expect(typingNames(present, thread.id, membership.member.id, [membership.member])).toEqual(["Someone", "Someone"])
  })
})
