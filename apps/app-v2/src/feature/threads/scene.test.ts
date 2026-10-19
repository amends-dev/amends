import { GroupId } from "@amends-dev/core/group"
import { ThreadId } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import {
  Command,
  click,
  expect,
  expectOutMessage,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import { bob, membership, opening, task, thread } from "../../../test/fixtures.ts"
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

const inputs = { members: [member, bob], groupName: "General", openThreadId: Option.none<ThreadId.ThreadId>() }

const sceneView = withViewInputs(view, inputs)()

/** A thread titled Retro that is being started, whose opening is not read yet. */
const retro = { ...thread, id: ThreadId.ThreadId.make("thread-2"), title: "Retro" }

const empty = init(workspaceId, memberId, groupId).model

/** The group's threads read: one opened by alice, in triage, with two messages new, and one that is being started. */
const listed = modifyFields(empty, {
  threads: () => [
    { thread, opening: Option.some(opening), task: Option.some(task), pending: false, unread: 2 },
    { thread: retro, opening: Option.none(), task: Option.none(), pending: true, unread: 0 }
  ]
})

const place = Drafts.Place.cases.Thread.make({ groupId })

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
