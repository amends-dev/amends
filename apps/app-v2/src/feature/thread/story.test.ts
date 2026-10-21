import {
  ThreadActivity,
  ThreadId,
  ThreadMessage,
  ThreadMessageId,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { saying } from "../../../test/fixtures.ts"
import { recordingStores } from "../../../test/recordingStores.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import {
  DeleteMessage,
  EditMessage,
  FollowThread,
  MarkThreadRead,
  PostReply,
  RenameThread,
  ScrollMessagesToEnd,
  TellTyping,
  UnfollowThread
} from "./command.ts"
import { ReplyBinding } from "./composition.ts"
import { availabilityOf, Message, type Model, titleOf } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const threadId = ThreadId.ThreadId.make("thread-1")
const participationId = ThreadParticipationId.ThreadParticipationId.make("participation-1")

const opening = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-1" },
  via: null,
  publishedAt: "2026-10-18T12:00:00Z",
  content: { _tag: "Text", text: "Plans for the week", mentions: [], revision: 1, editedAt: null }
})

/** The thread as it opens, its reply composer's draft read as empty. */
const opened: Model = init(workspaceId, memberId, threadId).model

/** What the reply composer reports, as the thread receives it. */
const fromReply = (message: typeof ComposerBlock.Message.Type) =>
  ReplyBinding.embedView({
    slotId: "reply",
    model: opened.reply,
    view: ComposerBlock.makeView((_model, h) => h.empty)
  }).toParentMessage(message)

const inThread = { workspaceId, memberId, threadId }
const reply = Drafts.Place.cases.Reply.make({ threadId })

/** The reply composer keeping `text` as its draft. */
const savingDraft = (text: string) => SaveDraft({ workspaceId, memberId, place: reply, text })

/** The thread read: its messages, the person's part in it, and how far they have read. */
const received = (latest: number, readThrough: number, active = true) =>
  message(
    Message.ReceivedThread({
      hasThread: true,
      title: Option.none(),
      messages: [{ message: opening, pending: false }],
      following: Option.some({ participationId, active, pending: false }),
      changes: [],
      latest,
      readThrough
    })
  )

/** The store answering that it holds the thread, which opens at its end, or that it does not. */
const answered = (hasThread: boolean) => [
  message(
    Message.ReceivedThread({
      hasThread,
      title: Option.none(),
      messages: [],
      following: Option.none(),
      changes: [],
      latest: 0,
      readThrough: 0
    })
  ),
  ...(hasThread
    ? [
        Command.expectExact(ScrollMessagesToEnd({ threadId, onlyIfNearEnd: false })),
        Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd())
      ]
    : [])
]

const unreadable = "This browser could not read that. Try again."

describe("a thread being read", () => {
  it("is loading until the store answers, available once it holds the thread, and unavailable once it answers without", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(availabilityOf(model)).toBe("Loading")
        expect(model.isLoaded).toBe(false)
      }),
      ...answered(true),
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
        expect(model.isLoaded).toBe(true)
      })
    )
    story(
      update,
      given(opened),
      ...answered(false),
      model((model) => {
        expect(availabilityOf(model)).toBe("Unavailable")
        expect(model.isLoaded).toBe(true)
      })
    )
  })

  it("is unavailable again when a thread it held is no longer there, and available when it comes back", () => {
    story(
      update,
      given(opened),
      ...answered(true),
      ...answered(false),
      model((model) => {
        expect(availabilityOf(model)).toBe("Unavailable")
      }),
      ...answered(true),
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
      })
    )
  })

  it("has failed when the read did, until the person asks to try again, which reads it again", () => {
    story(
      update,
      given(opened),
      message(Message.FailedRead({ error: unreadable })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Failed")
        expect(model.reads).toBe(0)
      }),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(availabilityOf(model)).toBe("Loading")
        expect(model.notice).toEqual(Option.none())
        expect(model.reads).toBe(1)
      }),
      message(Message.FailedRead({ error: unreadable })),
      message(Message.ClickedTryAgain()),
      model((model) => {
        expect(model.reads).toBe(2)
      }),
      ...answered(true),
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
      })
    )
  })

  it("is available, with the reason, when a later read fails after the thread was held", () => {
    story(
      update,
      given(opened),
      ...answered(true),
      message(Message.FailedRead({ error: unreadable })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Available")
        expect(model.notice).toEqual(Option.some(unreadable))
      })
    )
  })

  it("is unavailable, not failed, when the store answered without the thread before a read failed", () => {
    story(
      update,
      given(opened),
      ...answered(false),
      message(Message.FailedRead({ error: unreadable })),
      model((model) => {
        expect(availabilityOf(model)).toBe("Unavailable")
      })
    )
  })
})

describe("a thread's messages", () => {
  const written = (id: string, minute: number) => ({
    message: {
      ...opening,
      id: ThreadMessageId.ThreadMessageId.make(id),
      publishedAt: DateTime.makeUnsafe(`2026-10-18T12:0${minute}:00Z`)
    },
    pending: false
  })
  const readWith = (
    messages: ReadonlyArray<ReturnType<typeof written>>,
    changes: ReadonlyArray<Model["changes"][number]> = []
  ) =>
    message(
      Message.ReceivedThread({
        hasThread: true,
        title: Option.none(),
        messages,
        following: Option.none(),
        changes,
        latest: 0,
        readThrough: 0
      })
    )
  const scrolls = (onlyIfNearEnd: boolean) => [
    Command.expectExact(ScrollMessagesToEnd({ threadId, onlyIfNearEnd })),
    Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd())
  ]

  it("open scrolled to their end, and follow it as a message is added, while the person is near it", () => {
    story(
      update,
      given(opened),
      readWith([written("message-1", 0)]),
      ...scrolls(false),
      readWith([written("message-1", 0), written("message-2", 1)]),
      ...scrolls(true),
      readWith([written("message-1", 0), written("message-2", 1), written("message-3", 2)]),
      ...scrolls(true)
    )
  })

  it("follow a note of who followed the thread, as one more entry", () => {
    const followed = {
      id: ThreadActivity.ThreadActivityId.make("activity-1"),
      at: DateTime.makeUnsafe("2026-10-18T12:03:00Z"),
      change: "followed",
      memberId
    } as const

    story(
      update,
      given(opened),
      readWith([written("message-1", 0)]),
      ...scrolls(false),
      readWith([written("message-1", 0)], [followed]),
      ...scrolls(true)
    )
  })

  it("stay where they are when what is read adds nothing, as a read of the same messages again does", () => {
    story(
      update,
      given(opened),
      readWith([written("message-1", 0)]),
      ...scrolls(false),
      readWith([written("message-1", 0)]),
      Command.expectNone(),
      message(
        Message.ReceivedPresence({ present: [{ memberId: MemberId.MemberId.make("member-2"), typingIn: threadId }] })
      ),
      Command.expectNone()
    )
  })

  it("open scrolled to their end again when the thread comes back after it was gone", () => {
    story(
      update,
      given(opened),
      readWith([written("message-1", 0)]),
      ...scrolls(false),
      ...answered(false),
      readWith([written("message-1", 0)]),
      ...scrolls(false)
    )
  })
})

describe("a thread's title", () => {
  const formatted = { message: saying(opening, "**Plans** for the [week](https://example.com)"), pending: false }
  const read = modifyFields(opened, { messages: () => [formatted] })

  it("is its opening's words without the syntax of its markdown, or A thread while it is not read", () => {
    expect(titleOf(read)).toBe("Plans for the week")
    expect(titleOf(opened)).toBe("A thread")
  })

  it("is the title the thread was given, as written", () => {
    expect(titleOf(modifyFields(read, { title: () => Option.some("*Plans*") }))).toBe("*Plans*")
  })
})

describe("a thread", () => {
  it("is read through its latest activity, once, and its title and messages change from what was seen", () => {
    story(
      update,
      given(opened),
      received(4, 2),
      Command.expectExact(
        MarkThreadRead({ ...inThread, throughSequence: 4 }),
        ScrollMessagesToEnd({ threadId, onlyIfNearEnd: false })
      ),
      Command.resolve(MarkThreadRead, Message.WroteAction()),
      Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
      // Nothing newer than what it asked for: it does not ask again.
      received(4, 2),
      Command.expectNone(),
      message(Message.ClickedRename()),
      message(Message.TypedTitle({ title: "This week" })),
      message(Message.SubmittedRename()),
      Command.expectExact(RenameThread({ ...inThread, title: "This week", expectedTitle: null })),
      Command.resolve(RenameThread, Message.WroteAction()),
      message(Message.ClickedEdit({ messageId: opening.id })),
      message(Message.TypedEdit({ text: "Plans for next week" })),
      message(Message.SubmittedEdit()),
      Command.expectExact(
        EditMessage({ workspaceId, memberId, messageId: opening.id, text: "Plans for next week", expectedRevision: 1 })
      ),
      Command.resolve(EditMessage, Message.WroteAction()),
      message(Message.ClickedDelete({ messageId: opening.id })),
      Command.expectExact(DeleteMessage({ workspaceId, memberId, messageId: opening.id })),
      Command.resolve(DeleteMessage, Message.WroteAction()),
      message(Message.ClickedUnfollow()),
      Command.expectExact(UnfollowThread({ ...inThread, participationId })),
      Command.resolve(UnfollowThread, Message.WroteAction()),
      received(4, 4, false),
      message(Message.ClickedFollow()),
      Command.expectExact(FollowThread(inThread)),
      Command.resolve(FollowThread, Message.WroteAction())
    )
  })

  it("says the person types as they write a reply, at most as often as typing lasts, and that they stopped once it is sent", () => {
    let typing: Model | undefined
    story(
      update,
      given(opened),
      message(fromReply(ComposerBlock.Message.ReceivedDraft({ text: "" }))),
      message(fromReply(ComposerBlock.Message.TypedText({ text: "Sounds" }))),
      Command.expectExact(savingDraft("Sounds"), TellTyping({ workspaceId, threadId })),
      model((model) => {
        typing = model
      }),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      message(fromReply(ComposerBlock.Message.TypedText({ text: "Sounds good" }))),
      // Once told, typing is said again.
      Command.expectExact(savingDraft("Sounds good"), TellTyping({ workspaceId, threadId })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      message(fromReply(ComposerBlock.Message.SubmittedText())),
      Command.expectExact(
        savingDraft(""),
        PostReply({ ...inThread, text: "Sounds good" }),
        TellTyping({ workspaceId, threadId: null })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(PostReply, Message.WroteAction()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      model((model) => {
        expect(model.reply.text).toEqual(Option.some(""))
        expect(model.notice).toEqual(Option.none())
      })
    )
    // While typing is being told, more typing says nothing of it.
    expect(
      (update(typing!, fromReply(ComposerBlock.Message.TypedText({ text: "Sounds good" }))).commands ?? []).map(
        ({ name }) => name
      )
    ).not.toContain(TellTyping.name)
  })

  it.effect("writes a reply and an edit with the members their text mentions", () =>
    Effect.gen(function* () {
      const { written, layer } = recordingStores()
      const bob = ThreadMessage.mentionText("member-2", "Bob")
      const post = (text: string) =>
        PostReply({ ...inThread, text }).effect.pipe(Effect.provide(Layer.provide(PostReply.layer, layer)))
      const edit = (text: string) =>
        EditMessage({ workspaceId, memberId, messageId: opening.id, text, expectedRevision: 1 }).effect.pipe(
          Effect.provide(Layer.provide(EditMessage.layer, layer))
        )

      yield* post(`Sounds good, ${bob}`)
      yield* post("Sounds good")
      yield* edit(`Plans for next week, ${bob}`)
      yield* edit("Plans for next week")

      expect(written).toEqual([
        { action: "ThreadMessagePosted", payload: { threadId, text: `Sounds good, ${bob}`, mentions: ["member-2"] } },
        { action: "ThreadMessagePosted", payload: { threadId, text: "Sounds good", mentions: [] } },
        {
          action: "ThreadMessageEdited",
          payload: {
            messageId: opening.id,
            text: `Plans for next week, ${bob}`,
            mentions: ["member-2"],
            expectedRevision: 1
          }
        },
        {
          action: "ThreadMessageEdited",
          payload: { messageId: opening.id, text: "Plans for next week", mentions: [], expectedRevision: 1 }
        }
      ])
    })
  )

  it("keeps why a write could not be kept until the next one is", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedFollow()),
      Command.resolve(
        FollowThread,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedFollow()),
      Command.resolve(FollowThread, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })
})

describe("a thread editing a message that mentions a member", () => {
  const bobId = MemberId.MemberId.make("member-2")
  const mentioning = Schema.decodeSync(ThreadMessage.ThreadMessage)({
    id: "message-2",
    workspaceId: "workspace-1",
    threadId: "thread-1",
    author: { _tag: "Member", memberId: "member-1" },
    via: null,
    publishedAt: "2026-10-18T12:05:00Z",
    content: {
      _tag: "Text",
      text: "Thanks [@Bob](member:member-2), see [the plan](https://example.com)",
      mentions: ["member-2"],
      revision: 1,
      editedAt: null
    }
  })

  const readMentioning = message(
    Message.ReceivedThread({
      hasThread: true,
      title: Option.none(),
      messages: [{ message: mentioning, pending: false }],
      following: Option.none(),
      changes: [],
      latest: 1,
      readThrough: 1
    })
  )

  const opensForEditing = [
    readMentioning,
    Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
    message(Message.ClickedEdit({ messageId: mentioning.id }))
  ]

  it("loads it with the mention shown as the name, and the mention as its span", () => {
    story(
      update,
      given(opened),
      ...opensForEditing,
      model((model) => {
        expect(model.editing).toEqual(
          Option.some({
            messageId: mentioning.id,
            draft: "Thanks @Bob, see [the plan](https://example.com)",
            mentions: [{ memberId: bobId, from: 7, to: 11 }]
          })
        )
      })
    )
  })

  it("saves it with the mention as the link, whatever else was changed around it", () => {
    story(
      update,
      given(opened),
      ...opensForEditing,
      message(Message.TypedEdit({ text: "Many thanks @Bob, see [the plan](https://example.com)" })),
      model((model) => {
        expect(Option.map(model.editing, ({ mentions }) => mentions)).toEqual(
          Option.some([{ memberId: bobId, from: 12, to: 16 }])
        )
      }),
      message(Message.SubmittedEdit()),
      Command.expectExact(
        EditMessage({
          workspaceId,
          memberId,
          messageId: mentioning.id,
          text: "Many thanks [@Bob](member:member-2), see [the plan](https://example.com)",
          expectedRevision: 1
        })
      ),
      Command.resolve(EditMessage, Message.WroteAction())
    )
  })

  it("saves it as plain text once the person edited the name", () => {
    story(
      update,
      given(opened),
      ...opensForEditing,
      message(Message.TypedEdit({ text: "Thanks @Bobby, see [the plan](https://example.com)" })),
      message(Message.SubmittedEdit()),
      Command.expectExact(
        EditMessage({
          workspaceId,
          memberId,
          messageId: mentioning.id,
          text: "Thanks @Bobby, see [the plan](https://example.com)",
          expectedRevision: 1
        })
      ),
      Command.resolve(EditMessage, Message.WroteAction())
    )
  })
})
