import { GroupId } from "@amends-dev/core/group"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option } from "effect"
import {
  Command,
  all,
  click,
  expect,
  expectAll,
  expectOutMessage,
  given,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, membership, now, opening, task, thread } from "../../../test/fixtures.ts"
import { timeOf } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { StartThread } from "./command.ts"
import { Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { composerView, view } from "./view.ts"

const { member } = membership
const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const openedId = ThreadId.ThreadId.make("thread-1")

const inputs = {
  members: [member, bob],
  groupName: "General",
  openThreadId: Option.none<ThreadId.ThreadId>(),
  now
}

const sceneView = withViewInputs(view, inputs)()

/** A thread titled Retro that is being started, whose opening is not read yet. */
const retro = { ...thread, id: ThreadId.ThreadId.make("thread-2"), title: "Retro" }

const empty = init(workspaceId, memberId, groupId).model

/** A thread opened by alice, in triage, with two messages new and no replies. */
const alices = {
  thread,
  opening: Option.some(opening),
  task: Option.some(task),
  replies: 0,
  repliers: [],
  pending: false,
  unread: 2
}

/** The thread that is being started. */
const starting = {
  thread: retro,
  opening: Option.none(),
  task: Option.none(),
  replies: 0,
  repliers: [],
  pending: true,
  unread: 0
}

/** The group's threads read: alice's, and the one being started. */
const listed = modifyFields(empty, { threads: () => [alices, starting] })

const place = Drafts.Place.cases.Thread.make({ groupId })

/** The item of the list at `index`, a day's divider or a thread. */
const item = (index: number) => nth(all.role("listitem"), index)

/** Bob's thread, which was created a day before the time now. */
const yesterdays = {
  thread: { ...thread, id: ThreadId.ThreadId.make("thread-3"), createdAt: DateTime.subtract(now, { days: 1 }) },
  opening: Option.some({
    ...opening,
    author: ThreadMessage.Author.cases.Member.make({ memberId: bob.id }),
    publishedAt: DateTime.subtract(now, { days: 1 })
  }),
  task: Option.none(),
  replies: 0,
  repliers: [],
  pending: false,
  unread: 0
}

/** Bob and a member the store does not know, as authors. */
const bobAuthor = ThreadMessage.Author.cases.Member.make({ memberId: bob.id })
const strangerAuthor = ThreadMessage.Author.cases.Member.make({ memberId: MemberId.MemberId.make("member-9") })

/** The threads read: `threads`, in the order the store gives them. */
const listing = (...threads: typeof empty.threads) => modifyFields(empty, { threads: () => threads })

describe("a group's threads", () => {
  it("lists each as a message of the person who opened it, with its time, and its opening as the text that opens it", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(role("list", { name: "Threads" })).toExist(),
      expect(within(role("list", { name: "Threads" }), text("Alice"))).toExist(),
      expect(text("A")).toHaveAttr("aria-hidden", "true"),
      expect(text(timeOf(opening.publishedAt))).toExist(),
      expect(role("button", { name: "Plans for the week" })).toExist(),
      click(role("button", { name: "Plans for the week" })),
      expectOutMessage(OutMessage.SelectedThread({ threadId: openedId }))
    )
  })

  it("sets the threads apart by the day they were created on, and says when each was by its time of day or its day", () => {
    scene(
      { update, view: sceneView },
      given(listing(yesterdays, alices)),
      expectAll(all.role("listitem")).toHaveCount(4),
      expect(within(item(0), text("Yesterday"))).toExist(),
      expect(within(item(1), text("Bob"))).toExist(),
      expect(within(item(1), text("Yesterday"))).toExist(),
      expect(within(item(2), text("Today"))).toExist(),
      expect(within(item(3), text("Alice"))).toExist(),
      expect(within(item(3), text(timeOf(thread.createdAt)))).toExist()
    )
  })

  it("lists the threads oldest first by when they were created, in whatever order the store gives them", () => {
    for (const threads of [[yesterdays, alices] as const, [alices, yesterdays] as const]) {
      scene(
        { update, view: sceneView },
        given(listing(...threads)),
        expectAll(all.role("listitem")).toHaveCount(4),
        expect(within(item(0), text("Yesterday"))).toExist(),
        expect(within(item(1), text("Bob"))).toExist(),
        expect(within(item(2), text("Today"))).toExist(),
        expect(within(item(3), text("Alice"))).toExist()
      )
    }
  })

  it("lists the threads created on one day under one divider, oldest first", () => {
    const later = { ...starting, thread: { ...retro, createdAt: DateTime.subtract(now, { minutes: 10 }) } }

    scene(
      { update, view: sceneView },
      given(listing(later, alices)),
      expectAll(all.role("listitem")).toHaveCount(3),
      expect(within(item(0), text("Today"))).toExist(),
      expect(within(item(1), text("Alice"))).toExist(),
      expect(within(item(2), text("A thread"))).toExist()
    )
  })

  it("says when a thread was created before its opening is read, which leaves its author unknown", () => {
    const sentYesterday = { ...starting, thread: { ...retro, createdAt: DateTime.subtract(now, { days: 1 }) } }

    scene(
      { update, view: sceneView },
      given(listing(sentYesterday)),
      expectAll(all.role("listitem")).toHaveCount(2),
      expect(within(item(0), text("Yesterday"))).toExist(),
      expect(within(item(1), text("A thread"))).toExist(),
      expect(within(item(1), text("Yesterday"))).toExist()
    )
  })

  it("shows under a thread who replied, by their marks, and how many replies there are", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 3, repliers: [bobAuthor, strangerAuthor] })),
      expect(within(item(1), text("3 replies"))).toExist(),
      expect(within(item(1), text("B"))).toHaveAttr("aria-hidden", "true"),
      expect(within(item(1), text("S"))).toHaveAttr("aria-hidden", "true"),
      expect(within(item(1), text("2 new"))).toExist()
    )
  })

  it("says 1 reply for one reply, and shows no line for a thread that has none", () => {
    scene(
      { update, view: sceneView },
      given(listing({ ...alices, replies: 1, repliers: [bobAuthor] })),
      expect(within(item(1), text("1 reply"))).toExist(),
      expect(text(/replies/)).toBeAbsent()
    )
    scene({ update, view: sceneView }, given(listing(alices)), expect(text(/repl/)).toBeAbsent())
  })

  it("says how much of a thread is new and where its task stands, under it", () => {
    scene({ update, view: sceneView }, given(listed), expect(text("2 new")).toExist(), expect(text("Triage")).toExist())
  })

  it("shows a thread whose opening is not read yet by its title, as a thread, and says it is being started", () => {
    scene(
      { update, view: sceneView },
      given(listed),
      expect(role("button", { name: "Retro" })).toExist(),
      expect(text("A thread")).toExist(),
      expect(text("?")).toHaveAttr("aria-hidden", "true"),
      expect(text(" · Sending…")).toExist()
    )
  })

  it("marks the thread open in the group as the current one, and no other", () => {
    scene(
      { update, view: withViewInputs(view, { ...inputs, openThreadId: Option.some(openedId) })() },
      given(listed),
      expect(within(selector('[aria-current="true"]'), text("Alice"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("A thread"))).toBeAbsent()
    )
  })

  it("marks none as current while none is open", () => {
    scene({ update, view: sceneView }, given(listed), expect(selector('[aria-current="true"]')).toBeAbsent())
  })

  it("says so when there are none", () => {
    scene(
      { update, view: sceneView },
      given(empty),
      expect(text("No threads yet.")).toExist(),
      expect(role("list", { name: "Threads" })).toBeAbsent()
    )
  })

  it("says why they could not be read", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(empty, { notice: () => Option.some("This browser could not read that. Try again.") })),
      expect(role("alert")).toHaveText("This browser could not read that. Try again.")
    )
  })

  it("starts a thread from the composer, whose box is named for the group", () => {
    scene(
      { update, view: withViewInputs(composerView, inputs)() },
      given(empty),
      expect(role("form", { name: "Start a thread" })).toExist(),
      expect(label("Start a thread")).toHaveAttr("placeholder", "Message General"),
      type(label("Start a thread"), "Plans for the week"),
      Command.expectExact(SaveDraft({ workspaceId, memberId, place, text: "Plans for the week" })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      click(role("button", { name: "Start" })),
      Command.expectExact(
        SaveDraft({ workspaceId, memberId, place, text: "" }),
        StartThread({ workspaceId, memberId, groupId, text: "Plans for the week" })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(StartThread, Message.WroteAction())
    )
  })
})
