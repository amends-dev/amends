import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import * as Drafts from "../../store/Drafts.ts"
import { SaveDraft } from "./command.ts"
import { completeTail, Message, OutMessage, suggestMembers, tailQuery } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const place = Drafts.Place.cases.Reply.make({ threadId: ThreadId.ThreadId.make("thread-1") })

const composer = init(workspaceId, memberId, place).model

describe("a composer", () => {
  it("fills in the draft as it is read, unless the person began writing, keeps what they write, and sends it once", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "Hel" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hel" })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Hel" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      // The draft read meanwhile does not replace what was typed.
      message(Message.ReceivedDraft({ text: "Hello from last time" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hel"))
      }),
      message(Message.SubmittedText()),
      expectOutMessage(OutMessage.SubmittedText({ text: "Hel" })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      // Nothing to send sends nothing.
      message(Message.SubmittedText()),
      Command.expectNone(),
      expectNoOutMessage()
    )
  })

  it("sends nothing for a draft of only spaces, which stays as it was typed", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "  \n " })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      message(Message.SubmittedText()),
      Command.expectNone(),
      expectNoOutMessage(),
      model((model) => {
        expect(model.text).toEqual(Option.some("  \n "))
      })
    )
  })

  it("fills in the draft read when nothing was written yet", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hello from last time" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hello from last time"))
      })
    )
  })
})

const aliceId = MemberId.MemberId.make("member-2")

const typingAt = (text: string) => [
  message(Message.TypedText({ text })),
  Command.resolve(SaveDraft, Message.CompletedSaveDraft())
]

describe("a composer mentioning a member", () => {
  it("lists the members for the mention typed at the end of the text, moves among them, and writes the one picked", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "Hi @al" })),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ query: "al", activeIndex: 0, isDismissed: false }))
      }),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      message(Message.MovedSuggestion({ to: 1 })),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ query: "al", activeIndex: 1, isDismissed: false }))
      }),
      message(Message.PickedMention({ memberId: aliceId, name: "Alice" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi [@Alice](member:member-2) " })),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Hi [@Alice](member:member-2) " })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi [@Alice](member:member-2) "))
        expect(model.picking).toEqual(Option.none())
      })
    )
  })

  it("lists nothing once the mention ends, the text no longer ends in one, or the text is sent", () => {
    story(
      update,
      given(composer),
      ...typingAt("Hi @al"),
      ...typingAt("Hi @al "),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
      }),
      ...typingAt("Hi @al"),
      message(Message.SubmittedText()),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
      })
    )
  })

  it("keeps the list closed for the letters the person dismissed it for, and opens it for others", () => {
    story(
      update,
      given(composer),
      ...typingAt("Hi @al"),
      message(Message.DismissedSuggestions()),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ query: "al", activeIndex: 0, isDismissed: true }))
      }),
      // An edit elsewhere in the text leaves the mention at its end as it was.
      ...typingAt("Hello @al"),
      model((model) => {
        expect(Option.exists(model.picking, ({ isDismissed }) => isDismissed)).toBe(true)
      }),
      ...typingAt("Hello @ali"),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ query: "ali", activeIndex: 0, isDismissed: false }))
      })
    )
  })

  it("does not open the list for a draft that is read", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi @al" })),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
      })
    )
  })

  it("reads a mention being typed only at the end of the text, after a space or its start", () => {
    expect(tailQuery("@")).toEqual(Option.some(""))
    expect(tailQuery("Hi @al")).toEqual(Option.some("al"))
    expect(tailQuery("Hi\n@al")).toEqual(Option.some("al"))
    expect(tailQuery("Hi @al there")).toEqual(Option.none())
    expect(tailQuery("write to al@example.com")).toEqual(Option.none())
    expect(tailQuery("Hi [@Alice](member:member-2) ")).toEqual(Option.none())
    expect(tailQuery("Hi @@al")).toEqual(Option.none())
    expect(tailQuery("")).toEqual(Option.none())
  })

  it("completes the mention at the end of the text with the link and a space, and no other", () => {
    expect(completeTail("Hi @al", "[@Alice](member:member-2)")).toBe("Hi [@Alice](member:member-2) ")
    expect(completeTail("@", "[@Alice](member:member-2)")).toBe("[@Alice](member:member-2) ")
    expect(completeTail("Hi @al there", "[@Alice](member:member-2)")).toBe("Hi @al there")
    expect(completeTail("Hi @al", "[@Jo$&](member:member-4)")).toBe("Hi [@Jo$&](member:member-4) ")
  })

  it("suggests the active members with a word of their name starting with the letters, case and accents aside, up to eight, in order", () => {
    const named = (id: string, name: string, status: "active" | "removed" = "active") =>
      Schema.decodeSync(Member.Member)({
        id,
        workspaceId: "workspace-1",
        identity: { _tag: "Human", id },
        name,
        status
      })
    const members = [
      named("member-1", "Alice Chen"),
      named("member-2", "Álvaro Ruiz"),
      named("member-3", "Bob"),
      named("member-4", "Alan Turing"),
      named("member-5", "Alma Gone", "removed"),
      named("member-6", "Natalie Reed"),
      named("member-7", "Mary Alvarez"),
      ...["Ale", "Ali", "Alo", "Alu", "Aly", "Alb"].map((name, index) => named(`member-${index + 8}`, name))
    ]
    const names = (query: string) => suggestMembers(members, memberId, query).map(({ name }) => name)

    // The person, Alice Chen, is not suggested to themselves, Alma Gone has been removed, and "Natalie" only contains
    // "al", so it is left out. Alb, the ninth to fit, is cut off.
    expect(names("al")).toEqual(["Álvaro Ruiz", "Alan Turing", "Mary Alvarez", "Ale", "Ali", "Alo", "Alu", "Aly"])
    expect(names("ALV")).toEqual(["Álvaro Ruiz", "Mary Alvarez"])
    expect(names("alv")).toEqual(["Álvaro Ruiz", "Mary Alvarez"])
    expect(names("ruiz")).toEqual(["Álvaro Ruiz"])
    expect(names("uiz")).toEqual([])
    expect(names("")).toHaveLength(8)
    expect(names("zz")).toEqual([])
    expect(suggestMembers(members, MemberId.MemberId.make("member-2"), "al")[0]?.name).toBe("Alice Chen")
  })
})
