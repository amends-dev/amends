import { ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import * as Drafts from "../../store/Drafts.ts"
import { ReadSelection, SaveDraft, SelectText } from "./command.ts"
import {
  boxId,
  type Format,
  isFormattingShown,
  mentionQueryAt,
  Message,
  OutMessage,
  Reading,
  suggestMembers
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const place = Drafts.Place.cases.Reply.make({ threadId: ThreadId.ThreadId.make("thread-1") })

const composer = init(workspaceId, memberId, place).model

const draft = (text: string) => SaveDraft({ workspaceId, memberId, place, text })

const selecting = (at: number) => SelectText({ id: boxId(place), from: at, to: at })

const mentionReading = Reading.cases.Mention.make({})

const selectingRange = (from: number, to: number) => SelectText({ id: boxId(place), from, to })

const formatReading = (format: Format) => Reading.cases.Format.make({ format })

describe("a composer", () => {
  it("fills in the draft as it is read, unless the person began writing, keeps what they write, and sends it once", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "Hel" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hel" })),
      Command.expectExact(draft("Hel")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      // The draft read meanwhile does not replace what was typed.
      message(Message.ReceivedDraft({ text: "Hello from last time" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hel"))
      }),
      message(Message.SubmittedText()),
      expectOutMessage(OutMessage.SubmittedText({ text: "Hel" })),
      Command.expectExact(draft("")),
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
        expect(model.mentions).toEqual([])
      })
    )
  })
})

const aliceId = MemberId.MemberId.make("member-2")

const typed = (text: string) => [
  message(Message.TypedText({ text })),
  Command.resolve(SaveDraft, Message.CompletedSaveDraft())
]

describe("a composer mentioning a member", () => {
  it("lists the members for the mention typed at the end of the text, moves among them, and writes the one picked as a name", () => {
    story(
      update,
      given(composer),
      message(Message.TypedText({ text: "Hi @al" })),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "al", activeIndex: 0, isDismissed: false }))
      }),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      message(Message.MovedSuggestion({ to: 1 })),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "al", activeIndex: 1, isDismissed: false }))
      }),
      message(Message.PickedMention({ memberId: aliceId, name: "Alice" })),
      // What the box shows is the name, and the draft and the report say the link.
      expectOutMessage(OutMessage.ChangedText({ text: "Hi [@Alice](member:member-2) " })),
      Command.expectExact(draft("Hi [@Alice](member:member-2) "), selecting(10)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alice "))
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
        expect(model.picking).toEqual(Option.none())
      })
    )
  })

  it("lists the members for a mention typed before the caret in the middle of the text, and writes the name there", () => {
    story(
      update,
      given(composer),
      ...typed("Hi  there"),
      message(Message.TypedText({ text: "Hi @al there" })),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "al", activeIndex: 0, isDismissed: false }))
      }),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      message(Message.PickedMention({ memberId: aliceId, name: "Alice" })),
      Command.expectExact(draft("Hi [@Alice](member:member-2)  there"), selecting(10)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alice  there"))
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
      })
    )
  })

  it("lists nothing once the caret leaves the mention, the text no longer has one there, or the text is sent", () => {
    story(
      update,
      given(composer),
      ...typed("Hi @al"),
      ...typed("Hi @al "),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
      }),
      ...typed("Hi @al"),
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
      ...typed("Hi @al"),
      message(Message.DismissedSuggestions()),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "al", activeIndex: 0, isDismissed: true }))
      }),
      // The same letters, as the text is typed again, leave the list closed.
      ...typed("Hi @al"),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "al", activeIndex: 0, isDismissed: true }))
      }),
      ...typed("Hi @ali"),
      model((model) => {
        expect(model.picking).toEqual(Option.some({ from: 3, query: "ali", activeIndex: 0, isDismissed: false }))
      })
    )
  })

  it("lists nothing for a mention the person writes elsewhere than at the caret, which is left as typed", () => {
    story(
      update,
      given(composer),
      ...typed("Hi @al"),
      ...typed("Hello @al"),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
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

  it("does not list the members for the name of a mention already picked", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2) " })),
      message(Message.TypedText({ text: "Hi @Alice" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      model((model) => {
        expect(model.picking).toEqual(Option.none())
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
      })
    )
  })

  it("reads a mention being typed up to the caret, after a space or the start of the text", () => {
    const query = (text: string, caret = text.length) => mentionQueryAt(text, caret)

    expect(query("@")).toEqual(Option.some({ from: 0, query: "" }))
    expect(query("Hi @al")).toEqual(Option.some({ from: 3, query: "al" }))
    expect(query("Hi\n@al")).toEqual(Option.some({ from: 3, query: "al" }))
    expect(query("Hi @al there", 6)).toEqual(Option.some({ from: 3, query: "al" }))
    expect(query("Hi @alex there", 6)).toEqual(Option.some({ from: 3, query: "al" }))
    expect(query("Hi @al there")).toEqual(Option.none())
    expect(query("write to al@example.com")).toEqual(Option.none())
    expect(query("Hi @@al")).toEqual(Option.none())
    expect(query("")).toEqual(Option.none())
  })

  it("shows a mention in a draft that is read as its name, and keeps its span", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2), see [docs](https://example.com)" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alice, see [docs](https://example.com)"))
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
      }),
      // What the person goes on to write is kept as the draft in markdown, the mention still a link.
      message(Message.TypedText({ text: "Hi @Alice, see [docs](https://example.com) soon" })),
      expectOutMessage(
        OutMessage.ChangedText({ text: "Hi [@Alice](member:member-2), see [docs](https://example.com) soon" })
      ),
      Command.expectExact(draft("Hi [@Alice](member:member-2), see [docs](https://example.com) soon")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })

  it("sends the message with the mention as the link to its member, and keeps no mention for the next one", () => {
    story(
      update,
      given(composer),
      ...typed("Hi @al"),
      message(Message.PickedMention({ memberId: aliceId, name: "Alice" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      message(Message.TypedText({ text: "Hi @Alice please look" })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      message(Message.SubmittedText()),
      expectOutMessage(OutMessage.SubmittedText({ text: "Hi [@Alice](member:member-2) please look" })),
      Command.expectExact(draft("")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      model((model) => {
        expect(model.text).toEqual(Option.some(""))
        expect(model.mentions).toEqual([])
      })
    )
  })

  it("removes a mention whole when the person deletes its last letter, and puts the caret where it was", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2)" })),
      message(Message.TypedText({ text: "Hi @Alic" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi " })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi "))
        expect(model.mentions).toEqual([])
      }),
      // The draft is kept without it, and the box, which shows what was typed, is told to show what is left.
      Command.expectExact(draft("Hi "), selecting(3)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText())
    )
  })

  it("makes a mention plain text once the person edits its letters, and sends it as typed", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2)" })),
      message(Message.TypedText({ text: "Hi @Alicia" })),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi @Alicia" })),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alicia"))
        expect(model.mentions).toEqual([])
      }),
      Command.expectExact(draft("Hi @Alicia")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })

  it("moves the mentions with the text written before them, and keeps those it does not reach into", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2)" })),
      ...typed("Oh, Hi @Alice"),
      model((model) => {
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 7, to: 13 }])
      }),
      ...typed("Oh, Hi @Alice!"),
      model((model) => {
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 7, to: 13 }])
      })
    )
  })

  it("starts a mention where the caret is: reads the selection, writes an @ in place of it, and opens the list", () => {
    story(
      update,
      given(composer),
      ...typed("Hi there"),
      message(Message.ClickedMention()),
      Command.expectExact(ReadSelection({ id: boxId(place), reading: mentionReading })),
      Command.resolve(
        ReadSelection,
        Message.ReceivedSelection({ reading: mentionReading, selection: Option.some({ from: 3, to: 3 }) })
      ),
      expectOutMessage(OutMessage.ChangedText({ text: "Hi @there" })),
      Command.expectExact(draft("Hi @there"), selecting(4)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @there"))
        expect(model.picking).toEqual(Option.some({ from: 3, query: "", activeIndex: 0, isDismissed: false }))
      })
    )
  })

  it("starts a mention after a space where the caret follows a word, replacing what is selected", () => {
    story(
      update,
      given(composer),
      ...typed("Hi there"),
      message(Message.ReceivedSelection({ reading: mentionReading, selection: Option.some({ from: 2, to: 8 }) })),
      Command.expectExact(draft("Hi @"), selecting(4)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @"))
        expect(model.picking).toEqual(Option.some({ from: 3, query: "", activeIndex: 0, isDismissed: false }))
      })
    )
  })

  it("starts a mention at the end of the text when the box could not be read, and at the start of an empty box without a space", () => {
    story(
      update,
      given(composer),
      ...typed("Hi"),
      message(Message.ReceivedSelection({ reading: mentionReading, selection: Option.none() })),
      Command.expectExact(draft("Hi @"), selecting(4)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      ...typed(""),
      message(Message.ReceivedSelection({ reading: mentionReading, selection: Option.some({ from: 0, to: 0 }) })),
      Command.expectExact(draft("@"), selecting(1)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText())
    )
  })

  it("picks the member of a mention the button started, writing the name in place of the @", () => {
    story(
      update,
      given(composer),
      ...typed("Hi there"),
      message(Message.ReceivedSelection({ reading: mentionReading, selection: Option.some({ from: 3, to: 3 }) })),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      message(Message.PickedMention({ memberId: aliceId, name: "Alice" })),
      Command.expectExact(draft("Hi [@Alice](member:member-2) there"), selecting(10)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alice there"))
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
      })
    )
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

describe("a composer formatting its text", () => {
  it("reads the selection when a format is chosen, then writes the markdown and selects what the person goes on with", () => {
    story(
      update,
      given(composer),
      ...typed("Say hello now"),
      message(Message.ChoseFormat({ format: "Bold" })),
      Command.expectExact(ReadSelection({ id: boxId(place), reading: formatReading("Bold") })),
      Command.resolve(
        ReadSelection,
        Message.ReceivedSelection({ reading: formatReading("Bold"), selection: Option.some({ from: 4, to: 9 }) })
      ),
      Command.expectExact(draft("Say **hello** now"), selectingRange(6, 11)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Say **hello** now"))
      })
    )
  })

  it("reports the text it wrote as changed, and sends it as it stands", () => {
    story(
      update,
      given(composer),
      ...typed("Say hello now"),
      message(
        Message.ReceivedSelection({ reading: formatReading("Italic"), selection: Option.some({ from: 4, to: 9 }) })
      ),
      expectOutMessage(OutMessage.ChangedText({ text: "Say *hello* now" })),
      Command.expectExact(draft("Say *hello* now"), selectingRange(5, 10)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      message(Message.SubmittedText()),
      expectOutMessage(OutMessage.SubmittedText({ text: "Say *hello* now" })),
      Command.expectExact(draft("")),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft())
    )
  })

  it("writes a link as the text of one with its address selected, to be typed in its place", () => {
    story(
      update,
      given(composer),
      ...typed("see docs now"),
      message(
        Message.ReceivedSelection({ reading: formatReading("Link"), selection: Option.some({ from: 4, to: 8 }) })
      ),
      Command.expectExact(draft("see [docs](url) now"), selectingRange(11, 14)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText())
    )
  })

  it("formats the end of the text when the box could not be read, and a selection past the text is kept within it", () => {
    story(
      update,
      given(composer),
      ...typed("Say hi"),
      message(Message.ReceivedSelection({ reading: formatReading("Bold"), selection: Option.none() })),
      Command.expectExact(draft("Say hi****"), selecting(8)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      message(
        Message.ReceivedSelection({ reading: formatReading("Code"), selection: Option.some({ from: 40, to: 50 }) })
      ),
      Command.expectExact(draft("Say hi****``"), selecting(11)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText())
    )
  })

  it("keeps a picked mention through a format, drafts it as a link, and moves its span with the markers", () => {
    story(
      update,
      given(composer),
      message(Message.ReceivedDraft({ text: "Hi [@Alice](member:member-2) there" })),
      message(
        Message.ReceivedSelection({ reading: formatReading("Bold"), selection: Option.some({ from: 10, to: 15 }) })
      ),
      Command.expectExact(draft("Hi [@Alice](member:member-2) **there**"), selectingRange(12, 17)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("Hi @Alice **there**"))
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 3, to: 9 }])
      }),
      message(
        Message.ReceivedSelection({ reading: formatReading("Bold"), selection: Option.some({ from: 3, to: 9 }) })
      ),
      Command.expectExact(draft("Hi **[@Alice](member:member-2)** **there**"), selectingRange(5, 11)),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.mentions).toEqual([{ memberId: aliceId, from: 5, to: 11 }])
      })
    )
  })

  it("closes the list of people the format was chosen over", () => {
    story(
      update,
      given(composer),
      ...typed("Hi @al"),
      message(
        Message.ReceivedSelection({ reading: formatReading("Quote"), selection: Option.some({ from: 6, to: 6 }) })
      ),
      Command.resolve(SaveDraft, Message.CompletedSaveDraft()),
      Command.resolve(SelectText, Message.CompletedSelectText()),
      model((model) => {
        expect(model.text).toEqual(Option.some("> Hi @al"))
        expect(model.picking).toEqual(Option.none())
      })
    )
  })

  it("shows the toolbar at first, and a button shows it and hides it again", () => {
    story(
      update,
      given(composer),
      model((model) => {
        expect(isFormattingShown(model)).toBe(true)
      }),
      message(Message.ClickedFormattingToggle()),
      model((model) => {
        expect(isFormattingShown(model)).toBe(false)
      }),
      message(Message.ClickedFormattingToggle()),
      model((model) => {
        expect(isFormattingShown(model)).toBe(true)
      })
    )
  })

  it("hides the toolbar at first on a phone, until the person shows it, whatever the width becomes", () => {
    story(
      update,
      given(composer),
      message(Message.ChangedViewport({ viewport: "Phone" })),
      model((model) => {
        expect(isFormattingShown(model)).toBe(false)
      }),
      message(Message.ChangedViewport({ viewport: "Tablet" })),
      model((model) => {
        expect(isFormattingShown(model)).toBe(true)
      }),
      message(Message.ChangedViewport({ viewport: "Phone" })),
      message(Message.ClickedFormattingToggle()),
      model((model) => {
        expect(isFormattingShown(model)).toBe(true)
      }),
      message(Message.ChangedViewport({ viewport: "Desktop" })),
      message(Message.ChangedViewport({ viewport: "Phone" })),
      model((model) => {
        expect(isFormattingShown(model)).toBe(true)
      })
    )
  })

  it("keeps the person's choice to hide the toolbar on a wide window", () => {
    story(
      update,
      given(composer),
      message(Message.ClickedFormattingToggle()),
      message(Message.ChangedViewport({ viewport: "Split" })),
      model((model) => {
        expect(isFormattingShown(model)).toBe(false)
      })
    )
  })
})
