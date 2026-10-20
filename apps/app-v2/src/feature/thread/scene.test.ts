import {
  ThreadActivity,
  ThreadId,
  ThreadMessage,
  ThreadMessageId,
  ThreadParticipationId
} from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Mount,
  Subscription,
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
import { deleted, now, saying, scout, task, turnOf } from "../../../test/fixtures.ts"
import { timeOf } from "../../seen.ts"
import * as Drafts from "../../store/Drafts.ts"
import { ComposerBlock } from "../composer/block.ts"
import { SaveDraft } from "../composer/command.ts"
import { TurnsBlock } from "../turns/block.ts"
import { ScrollLogToEnd } from "../turns/command.ts"
import { subscriptions as turnsSubscriptions } from "../turns/subscription.ts"
import { ThreadBlock } from "./block.ts"
import {
  DeleteMessage,
  EditMessage,
  FollowThread,
  PostReply,
  RenameThread,
  RevealHighlightedMessage,
  ScrollMessagesToEnd,
  TellTyping,
  UnfollowThread
} from "./command.ts"
import {
  type Following,
  Message,
  OutMessage,
  type ParticipationChange,
  type ParticipationChangeKind
} from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { followView, replyView, turnLogView, view } from "./view.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const threadId = ThreadId.ThreadId.make("thread-1")

const alice = Schema.decodeSync(Member.Member)({
  id: "member-1",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "alice" },
  name: "Alice",
  status: "active"
})
const bob = Schema.decodeSync(Member.Member)({
  id: "member-2",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "bob" },
  name: "Bob",
  status: "active"
})

const opening = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-1" },
  via: null,
  publishedAt: "2026-10-18T12:00:00Z",
  content: { _tag: "Text", text: "Plans for the week", mentions: [], revision: 1, editedAt: null }
})

const reply = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-2",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-2" },
  via: null,
  publishedAt: "2026-10-18T12:05:00Z",
  content: { _tag: "Text", text: "Sounds good", mentions: [], revision: 1, editedAt: null }
})

/** The reply composer keeping `text` as its draft. */
const savingDraft = (text: string) =>
  SaveDraft({ workspaceId, memberId, place: Drafts.Place.cases.Reply.make({ threadId }), text })

const sceneView = withViewInputs(view, { now })()

/** The side pane's bell, body and footer, as the group's side pane puts them. */
const sidePane = (model: Parameters<typeof sceneView>[0], h: Parameters<typeof sceneView>[1]) =>
  h.div([], [followView(model, h), sceneView(model, h), replyView(model, h)])

/** The side pane, and the log of a turn as the group puts it in place of the thread, so that both can be looked at. */
const sidePaneAndTurnLog = (model: Parameters<typeof sceneView>[0], h: Parameters<typeof sceneView>[1]) =>
  h.div([], [sidePane(model, h), withViewInputs(turnLogView, { where: "Thread in #general" })()(model, h)])

/** The thread read with `messages`, written by alice and bob, whose names are read. */
const readWith = (...messages: ReadonlyArray<Readonly<{ message: ThreadMessage.ThreadMessage; pending: boolean }>>) => [
  Subscription.emit(
    subscriptions.thread,
    Message.ReceivedThread({
      hasThread: true,
      title: Option.none(),
      messages,
      following: Option.none(),
      changes: [],
      latest: 0,
      readThrough: 0
    })
  ),
  Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
  Subscription.emit(subscriptions.thread, Message.ReceivedPeople({ members: [alice, bob], contacts: [] }))
]

/**
 * The thread read with `messages`, written by alice and bob, whose names are read, when one of them is highlighted,
 * which the thread reveals once it is drawn.
 */
const readHighlighted = (
  ...messages: ReadonlyArray<Readonly<{ message: ThreadMessage.ThreadMessage; pending: boolean }>>
) => [
  Subscription.emit(
    subscriptions.thread,
    Message.ReceivedThread({
      hasThread: true,
      title: Option.none(),
      messages,
      following: Option.none(),
      changes: [],
      latest: 0,
      readThrough: 0
    })
  ),
  Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
  Mount.resolve(RevealHighlightedMessage, Message.CompletedRevealHighlightedMessage()),
  Subscription.emit(subscriptions.thread, Message.ReceivedPeople({ members: [alice, bob], contacts: [] }))
]

/** The change `kind` to `member`'s part in the thread, made `at`. */
const changing = (
  kind: ParticipationChangeKind,
  member: typeof alice,
  at: string,
  id = "activity-1"
): ParticipationChange => ({
  id: ThreadActivity.ThreadActivityId.make(id),
  at: DateTime.makeUnsafe(at),
  change: kind,
  memberId: member.id
})

/** The thread read with `messages` and the `changes` to who takes part in it. */
const readWithChanges = (
  messages: ReadonlyArray<Readonly<{ message: ThreadMessage.ThreadMessage; pending: boolean }>>,
  changes: ReadonlyArray<ParticipationChange>
) => [
  Subscription.emit(
    subscriptions.thread,
    Message.ReceivedThread({
      hasThread: true,
      title: Option.none(),
      messages,
      following: Option.none(),
      changes,
      latest: 0,
      readThrough: 0
    })
  ),
  Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
  Subscription.emit(subscriptions.thread, Message.ReceivedPeople({ members: [alice, bob], contacts: [] }))
]

/** The thread's turns read, with the workspace's members who name their agents. */
const turnsRead = (...turns: ReadonlyArray<ReturnType<typeof turnOf>>) => [
  Subscription.emit(
    turnsSubscriptions.turns,
    TurnsBlock.Message.ReceivedTurns({ turns: turns.map((turn) => ({ turn, pending: false, retryOpen: false })) })
  ),
  Subscription.emit(turnsSubscriptions.turns, TurnsBlock.Message.ReceivedMembers({ members: [alice, bob, scout] }))
]

const participationId = ThreadParticipationId.ThreadParticipationId.make("participation-1")

const opened = init(workspaceId, memberId, threadId).model

/** The thread once the store has answered that it holds it, and has nothing in it yet. */
const read = modifyFields(opened, { isLoaded: () => true, hasThread: () => true })

/** The thread when it tracks a task, which is in triage and assigned to no one. */
const trackingTask = modifyFields(read, {
  task: (taskModel) => modifyFields(taskModel, { task: () => Option.some({ task, pending: false }) })
})

/** The thread read when the store answered `hasThread`. */
const answered = (hasThread: boolean) => [
  Subscription.emit(
    subscriptions.thread,
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
  ...(hasThread ? [Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd())] : [])
]

describe("a thread being read", () => {
  it("says that it is loading until the store answers, and then shows its timeline", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      expect(within(role("region", { name: "Thread" }), role("status"))).toHaveText("Loading the thread…"),
      expect(role("list", { name: "Messages" })).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      ...answered(true),
      expect(text("Loading the thread…")).toBeAbsent(),
      expect(role("list", { name: "Messages" })).toExist()
    )
  })

  it("says that it is not available once the store answers without it, and shows it again when it comes back", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...answered(false),
      expect(
        within(role("region", { name: "Thread" }), role("heading", { name: "This thread isn't available", level: 2 }))
      ).toExist(),
      expect(text("It may be in a group you no longer belong to.")).toExist(),
      expect(text("Loading the thread…")).toBeAbsent(),
      expect(role("list", { name: "Messages" })).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      ...answered(true),
      expect(role("heading", { name: "This thread isn't available" })).toBeAbsent(),
      expect(role("list", { name: "Messages" })).toExist()
    )
  })

  it("says that it could not be read, with a Try again that reads it again", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      Subscription.emit(subscriptions.thread, Message.FailedRead({ error: "This browser could not read that." })),
      expect(
        within(role("region", { name: "Thread" }), role("heading", { name: "Can't load this thread", level: 2 }))
      ).toExist(),
      expect(text("Try again once the host is reachable.")).toExist(),
      expect(role("list", { name: "Messages" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      expect(role("heading", { name: "Can't load this thread" })).toBeAbsent(),
      expect(text("Loading the thread…")).toExist(),
      ...answered(true),
      expect(role("list", { name: "Messages" })).toExist()
    )
  })

  it("keeps showing a thread it held, with why, when a later read fails", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...answered(true),
      Subscription.emit(subscriptions.thread, Message.FailedRead({ error: "This browser could not read that." })),
      expect(role("list", { name: "Messages" })).toExist(),
      expect(text("This browser could not read that.")).toExist(),
      expect(role("heading", { name: "Can't load this thread" })).toBeAbsent()
    )
  })
})

describe("a thread", () => {
  it("shows its messages by their authors, who types, and takes a reply", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: true }),
      expect(text("Plans for the week")).toExist(),
      expect(text("Alice")).toExist(),
      expect(text("Bob")).toExist(),
      // The author's letters mark the message, and its time follows the author.
      expect(text("A")).toHaveAttr("aria-hidden", "true"),
      expect(text("B")).toHaveAttr("aria-hidden", "true"),
      expect(text(timeOf(opening.publishedAt))).toExist(),
      // A reply on its way is marked so, and only the person's own messages can be edited.
      expect(text(" · Sending…")).toExist(),
      expect(role("button", { name: "Edit" })).toExist(),
      expect(role("button", { name: "Follow thread" })).toExist(),
      Subscription.emit(
        subscriptions.presence,
        Message.ReceivedPresence({ present: [{ memberId: bob.id, typingIn: threadId }] })
      ),
      expect(text("Bob is typing…")).toExist(),
      type(label("Reply in thread"), "Will do"),
      Command.expectExact(savingDraft("Will do"), TellTyping({ workspaceId, threadId })),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      click(role("button", { name: "Send" })),
      Command.expectExact(
        savingDraft(""),
        PostReply({ workspaceId, memberId, threadId, text: "Will do" }),
        TellTyping({ workspaceId, threadId: null })
      ),
      Command.resolve(SaveDraft, ComposerBlock.Message.CompletedSaveDraft()),
      Command.resolve(PostReply, Message.WroteAction()),
      Command.resolve(TellTyping, Message.ToldTyping())
    )
  })

  it("shows a message's text as markdown, a mention in it as the name its member has now", () => {
    const formatted = saying(
      reply,
      `**Ship** it ${ThreadMessage.mentionText(bob.id, "Robert")}, [the notes](https://example.com):\n\n- \`one\`\n- two`
    )

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: formatted, pending: false }),
      expect(selector("strong")).toHaveText("Ship"),
      expect(text("the notes")).toHaveAttr("href", "https://example.com"),
      expect(selector("code")).toHaveText("one"),
      expectAll(all.selector("ul li")).toHaveCount(2),
      expect(text("@Bob")).toHaveClass("bg-mention"),
      expect(text("@Robert")).toBeAbsent()
    )
  })

  it("shows a task's description as markdown, with the opening's mention as the name its member has now", () => {
    const described = saying(opening, `Ask ${ThreadMessage.mentionText(bob.id, "Robert")} about **retries**:\n\n> soon`)

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      ...readWith({ message: described, pending: false }, { message: reply, pending: false }),
      expect(within(role("region", { name: "Task" }), selector("strong"))).toHaveText("retries"),
      expect(selector("blockquote")).toHaveText("soon"),
      expect(text("@Bob")).toHaveClass("bg-mention"),
      expect(text("@Robert")).toBeAbsent()
    )
  })

  it("says who types as one person, two, or several", () => {
    const carol = Schema.decodeSync(Member.Member)({
      id: "member-3",
      workspaceId: "workspace-1",
      identity: { _tag: "Human", id: "carol" },
      name: "Carol",
      status: "active"
    })
    const dana = Schema.decodeSync(Member.Member)({
      id: "member-4",
      workspaceId: "workspace-1",
      identity: { _tag: "Human", id: "dana" },
      name: "Dana",
      status: "active"
    })
    const typing = (...members: ReadonlyArray<typeof carol>) =>
      Subscription.emit(
        subscriptions.presence,
        Message.ReceivedPresence({ present: members.map(({ id }) => ({ memberId: id, typingIn: threadId })) })
      )

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(read),
      Subscription.emit(
        subscriptions.thread,
        Message.ReceivedPeople({ members: [alice, bob, carol, dana], contacts: [] })
      ),
      typing(bob),
      expect(text("Bob is typing…")).toExist(),
      typing(bob, carol),
      expect(text("Bob and Carol are typing…")).toExist(),
      typing(bob, carol, dana),
      expect(text("Several people are typing…")).toExist(),
      typing(),
      expect(selector("[aria-live]")).toHaveText("")
    )
  })

  it("sets its timeline under a divider for each day, each message by its time of day", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: yesterday, pending: false }, { message: reply, pending: false }),
      expect(nth(all.role("listitem"), 0)).toHaveText("Yesterday"),
      expect(within(nth(all.role("listitem"), 1), text("Plans for the week"))).toExist(),
      expect(nth(all.role("listitem"), 2)).toHaveText("1 reply"),
      expect(nth(all.role("listitem"), 3)).toHaveText("Today"),
      expect(within(nth(all.role("listitem"), 4), text("Sounds good"))).toExist(),
      expect(text(timeOf(yesterday.publishedAt))).toExist(),
      expect(text(timeOf(reply.publishedAt))).toExist()
    )
  })

  it("lays a thread that tracks a task out as the task's properties, its description, and its activity", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(role("region", { name: "Task" })).toExist(),
      expect(role("region", { name: "Thread" })).toBeAbsent(),
      expect(role("group", { name: "Properties" })).toExist(),
      expect(text("Description")).toExist(),
      // The opening is the description, which the activity does not repeat.
      expect(text("Plans for the week")).toExist(),
      expect(within(role("list", { name: "Activity" }), text("Activity"))).toExist(),
      expect(within(role("list", { name: "Activity" }), text(/^Alice created this task · /))).toExist(),
      expect(within(role("list", { name: "Activity" }), text("Sounds good"))).toExist(),
      expect(within(role("list", { name: "Activity" }), text("Plans for the week"))).toBeAbsent(),
      expect(role("list", { name: "Messages" })).toBeAbsent()
    )
  })

  it("edits and deletes the description, the person's own opening, where it is read", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expectAll(all.role("button", { name: "Edit" })).toHaveCount(1),
      click(role("button", { name: "Edit" })),
      expect(label("Edit")).toHaveValue("Plans for the week"),
      type(label("Edit"), "Plans for next week"),
      click(role("button", { name: "Save" })),
      Command.expectExact(
        EditMessage({
          workspaceId,
          memberId,
          messageId: opening.id,
          text: "Plans for next week",
          expectedRevision: 1
        })
      ),
      Command.resolve(EditMessage, Message.WroteAction())
    )
  })

  it("keeps Rename above the task, and describes nothing until the opening is read", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      expect(role("button", { name: "Rename" })).toExist(),
      expect(role("list", { name: "Activity" })).toExist(),
      expect(text("Description")).toBeAbsent()
    )
  })

  it("puts the person's part in the thread in a bell: Follow thread, then Following thread, pressed, which unfollows", () => {
    const readFollowing = (following: Option.Option<Following>) =>
      Subscription.emit(
        subscriptions.thread,
        Message.ReceivedThread({
          hasThread: true,
          title: Option.none(),
          messages: [],
          following,
          changes: [],
          latest: 0,
          readThrough: 0
        })
      )

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      readFollowing(Option.none()),
      Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
      expect(role("button", { name: "Follow thread" })).toHaveAttr("aria-pressed", "false"),
      click(role("button", { name: "Follow thread" })),
      Command.expectExact(FollowThread({ workspaceId, memberId, threadId })),
      Command.resolve(FollowThread, Message.WroteAction()),
      readFollowing(Option.some({ participationId, active: true, pending: false })),
      expect(role("button", { name: "Follow thread" })).toBeAbsent(),
      expect(role("button", { name: "Following thread" })).toHaveAttr("aria-pressed", "true"),
      click(role("button", { name: "Following thread" })),
      Command.expectExact(UnfollowThread({ workspaceId, memberId, threadId, participationId })),
      Command.resolve(UnfollowThread, Message.WroteAction()),
      readFollowing(Option.some({ participationId, active: false, pending: false })),
      expect(role("button", { name: "Follow thread" })).toHaveAttr("aria-pressed", "false"),
      readFollowing(Option.some({ participationId, active: true, pending: true })),
      expect(role("button", { name: "Follow thread" })).toBeAbsent(),
      expect(role("button", { name: "Following thread" })).toHaveAttr("aria-pressed", "true"),
      expect(role("button", { name: "Following thread" })).toBeDisabled(),
      expect(text(" · Sending…")).toBeAbsent(),
      readFollowing(Option.some({ participationId, active: false, pending: true })),
      expect(role("button", { name: "Follow thread" })).toHaveAttr("aria-pressed", "false"),
      expect(role("button", { name: "Follow thread" })).toBeDisabled(),
      readFollowing(Option.some({ participationId, active: false, pending: false })),
      expect(role("button", { name: "Follow thread" })).toBeEnabled()
    )
  })

  it("places an agent's turn among the messages at the moment it took on the work, under its day", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }
    const tookWork = turnOf("turn-1", "running", {
      createdAt: DateTime.formatIso(DateTime.add(yesterday.publishedAt, { minutes: 1 }))
    })

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: yesterday, pending: false }, { message: reply, pending: false }),
      ...turnsRead(tookWork),
      expect(nth(all.role("listitem"), 0)).toHaveText("Yesterday"),
      expect(within(nth(all.role("listitem"), 1), text("Plans for the week"))).toExist(),
      expect(nth(all.role("listitem"), 2)).toHaveText("1 reply"),
      expect(within(nth(all.role("listitem"), 3), role("group", { name: "Scout's turn" }))).toExist(),
      expect(nth(all.role("listitem"), 4)).toHaveText("Today"),
      expect(within(nth(all.role("listitem"), 5), text("Sounds good"))).toExist(),
      // The turns are not a section of their own above the messages.
      expect(role("region", { name: "Turns" })).toBeAbsent()
    )
  })

  it("places a turn that took on the work between two messages of one day by the time it did", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      ...turnsRead(turnOf("turn-1", "running", { createdAt: "2026-10-18T12:02:00Z" })),
      expect(nth(all.role("listitem"), 0)).toHaveText("Today"),
      expect(within(nth(all.role("listitem"), 3), role("group", { name: "Scout's turn" }))).toExist(),
      expect(within(nth(all.role("listitem"), 4), text("Sounds good"))).toExist(),
      ...turnsRead(turnOf("turn-1", "running", { createdAt: "2026-10-18T12:10:00Z" })),
      expect(within(nth(all.role("listitem"), 3), text("Sounds good"))).toExist(),
      expect(within(nth(all.role("listitem"), 4), role("group", { name: "Scout's turn" }))).toExist()
    )
  })

  it("shows a turn that replied as its reply, with View turn log, and no row of its own", () => {
    const replied = turnOf("turn-1", "completed", { messageIds: ["message-2"], createdAt: "2026-10-18T12:02:00Z" })

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      ...turnsRead(replied),
      expect(role("group", { name: "Scout's turn" })).toBeAbsent(),
      expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist(),
      expectAll(all.role("button", { name: "View turn log" })).toHaveCount(1),
      expect(within(nth(all.role("listitem"), 3), text("Sounds good"))).toExist(),
      expect(within(nth(all.role("listitem"), 3), role("button", { name: "View turn log" }))).toExist(),
      // Its log is not drawn among the messages: it opens in the side pane.
      click(role("button", { name: "View turn log" })),
      expect(role("group", { name: "Scout's turn log" })).toBeAbsent(),
      expectAll(all.role("button", { name: "View turn log" })).toHaveCount(1)
    )
  })

  describe("the log of a turn, opened", () => {
    const replied = turnOf("turn-1", "completed", { messageIds: ["message-2"], createdAt: "2026-10-18T12:02:00Z" })
    const readyToOpen = [
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      ...turnsRead(replied)
    ]

    it("shows in the side pane, and goes back to the thread at its end", () => {
      scene(
        { update, view: sidePaneAndTurnLog, subscriptions: ThreadBlock.subscriptions },
        ...readyToOpen,
        expect(role("complementary", { name: "Turn log" })).toBeAbsent(),
        click(role("button", { name: "View turn log" })),
        expect(role("complementary", { name: "Turn log" })).toExist(),
        expect(text("Loading the turn log…")).toExist(),
        click(role("button", { name: "Back to thread" })),
        Command.expectExact(ScrollMessagesToEnd({ threadId, onlyIfNearEnd: false })),
        Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
        expect(role("complementary", { name: "Turn log" })).toBeAbsent(),
        expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist()
      )
    })

    it("is reported closed, which leaves the thread too", () => {
      scene(
        { update, view: sidePaneAndTurnLog, subscriptions: ThreadBlock.subscriptions },
        ...readyToOpen,
        click(role("button", { name: "View turn log" })),
        click(role("button", { name: "Close turn log" })),
        expectOutMessage(OutMessage.ClosedTurnLog())
      )
    })

    it("goes back to the thread from the reply it names", () => {
      scene(
        { update, view: sidePaneAndTurnLog, subscriptions: ThreadBlock.subscriptions },
        ...readyToOpen,
        click(role("button", { name: "View turn log" })),
        Subscription.emit(
          turnsSubscriptions.log,
          TurnsBlock.Message.ReceivedLog({
            turnId: replied.id,
            logMessage: Turn.LogMessage.cases.Opened.make({ items: [] })
          })
        ),
        Command.resolve(ScrollLogToEnd, TurnsBlock.Message.CompletedScrollLogToEnd()),
        click(role("button", { name: "View reply in thread" })),
        Command.expectExact(ScrollMessagesToEnd({ threadId, onlyIfNearEnd: false })),
        Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
        expect(role("complementary", { name: "Turn log" })).toBeAbsent()
      )
    })
  })

  it("says who followed the thread or stopped taking part in it, as the person or as someone else", () => {
    const noted = (kind: ParticipationChangeKind, member: typeof alice, line: string) =>
      scene(
        { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
        given(opened),
        ...readWithChanges([{ message: opening, pending: false }], [changing(kind, member, "2026-10-18T12:02:00Z")]),
        expect(within(role("list", { name: "Messages" }), text(line))).toExist()
      )

    noted("followed", bob, "Bob followed this thread")
    noted("followed", alice, "You followed this thread")
    noted("unfollowed", bob, "Bob stopped following")
    noted("unfollowed", alice, "You stopped following")
    noted("left-group", bob, "Bob left the group")
    noted("left-group", alice, "You left the group")
    noted("removed-from-group", bob, "Bob was removed from the group")
    noted("removed-from-group", alice, "You were removed from the group")
    noted("removed-from-workspace", bob, "Bob was removed from the workspace")
    noted("removed-from-workspace", alice, "You were removed from the workspace")
  })

  it("places a note among the messages at the time of the change, quietly, with that time", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWithChanges(
        [
          { message: opening, pending: false },
          { message: reply, pending: false }
        ],
        [changing("followed", bob, "2026-10-18T12:02:00Z")]
      ),
      expect(nth(all.role("listitem"), 0)).toHaveText("Today"),
      expect(within(nth(all.role("listitem"), 1), text("Plans for the week"))).toExist(),
      expect(nth(all.role("listitem"), 2)).toHaveText("1 reply"),
      expect(within(nth(all.role("listitem"), 3), text("Bob followed this thread"))).toHaveClass("text-ink-secondary"),
      expect(
        within(nth(all.role("listitem"), 3), text(timeOf(DateTime.makeUnsafe("2026-10-18T12:02:00Z"))))
      ).toHaveClass("text-ink-muted"),
      expect(within(nth(all.role("listitem"), 4), text("Sounds good"))).toExist()
    )
  })

  it("places a note under its day, and does not count it among the replies", () => {
    const yesterday = { ...opening, publishedAt: DateTime.subtract(now, { days: 1 }) }

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWithChanges(
        [{ message: yesterday, pending: false }],
        [changing("left-group", bob, "2026-10-18T12:10:00Z")]
      ),
      expect(nth(all.role("listitem"), 0)).toHaveText("Yesterday"),
      expect(within(nth(all.role("listitem"), 1), text("Plans for the week"))).toExist(),
      expect(nth(all.role("listitem"), 2)).toHaveText("Today"),
      expect(within(nth(all.role("listitem"), 3), text("Bob left the group"))).toExist(),
      expect(text(/repl/)).toBeAbsent()
    )
  })

  it("places the notes of a thread that tracks a task among its activity, by the day and the time of day", () => {
    const yesterdayNoon = DateTime.formatIso(DateTime.subtract(now, { days: 1 }))

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      ...readWithChanges(
        [
          { message: opening, pending: false },
          { message: reply, pending: false }
        ],
        [changing("followed", bob, "2026-10-18T12:02:00Z"), changing("unfollowed", alice, yesterdayNoon, "activity-2")]
      ),
      expect(within(nth(all.role("listitem"), 1), text(/^Alice created this task · /))).toExist(),
      expect(within(nth(all.role("listitem"), 3), text("Bob followed this thread"))).toExist(),
      expect(within(nth(all.role("listitem"), 4), text("Sounds good"))).toExist(),
      // No divider says its day here, so the one that was not today says it.
      expect(within(nth(all.role("listitem"), 2), text("You stopped following"))).toExist(),
      expect(within(nth(all.role("listitem"), 2), text("Yesterday"))).toExist()
    )
  })

  it("shows a turn as a row while the message it replied with is not in the thread", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      ...turnsRead(turnOf("turn-1", "completed", { messageIds: ["message-9"] })),
      expect(role("group", { name: "Scout's turn" })).toExist(),
      expect(role("button", { name: "View turn log" })).toBeAbsent()
    )
  })

  it("gives a turn's row its buttons, and its log opens in the side pane", () => {
    scene(
      { update, view: sidePaneAndTurnLog, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      ...turnsRead(turnOf("turn-1", "running")),
      expect(within(role("group", { name: "Scout's turn" }), text("Scout"))).toExist(),
      expect(within(role("group", { name: "Scout's turn" }), role("status"))).toHaveText("Working"),
      click(role("button", { name: "View log" })),
      expect(role("complementary", { name: "Turn log" })).toExist(),
      expect(within(role("group", { name: "Scout's turn" }), text("Loading the turn log…"))).toBeAbsent()
    )
  })

  it("places the turns of a thread that tracks a task among its activity, after the task was created", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(trackingTask),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      ...turnsRead(turnOf("turn-1", "running", { createdAt: "2026-10-18T12:02:00Z" })),
      expect(nth(all.role("listitem"), 0)).toHaveText("Activity"),
      expect(within(nth(all.role("listitem"), 1), text(/^Alice created this task · /))).toExist(),
      expect(within(nth(all.role("listitem"), 2), role("group", { name: "Scout's turn" }))).toExist(),
      expect(within(nth(all.role("listitem"), 3), text("Sounds good"))).toExist(),
      expect(role("region", { name: "Turns" })).toBeAbsent()
    )
  })

  it("says why the turns could not be read, above its timeline", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      Subscription.emit(
        turnsSubscriptions.turns,
        TurnsBlock.Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist()
    )
  })

  it("lists the opening first, then how many replies follow it, then the replies, and leaves its title to the pane", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      expect(role("list", { name: "Messages" })).toExist(),
      expect(text(/repl/)).toBeAbsent(),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(within(role("list", { name: "Messages" }), text("1 reply"))).toExist(),
      expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist(),
      ...readWith(
        { message: opening, pending: false },
        { message: reply, pending: false },
        { message: { ...reply, id: ThreadMessageId.ThreadMessageId.make("message-3") }, pending: false }
      ),
      expect(within(role("list", { name: "Messages" }), text("2 replies"))).toExist(),
      expect(role("heading")).toBeAbsent()
    )
  })

  it("renames the thread from a form that replaces the Rename button, and cancels", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      click(role("button", { name: "Rename" })),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(label("Title")).toHaveValue(""),
      click(role("button", { name: "Cancel" })),
      expect(label("Title")).toBeAbsent(),
      click(role("button", { name: "Rename" })),
      type(label("Title"), "This week"),
      click(role("button", { name: "Save" })),
      Command.expectExact(RenameThread({ workspaceId, memberId, threadId, title: "This week", expectedTitle: null })),
      Command.resolve(RenameThread, Message.WroteAction()),
      expect(label("Title")).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toExist()
    )
  })

  it("edits the person's own message in a form in its place, and deletes it", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      // Bob's message is not the person's own: the only Edit and Delete are on the opening.
      click(role("button", { name: "Edit" })),
      expect(label("Edit")).toHaveValue("Plans for the week"),
      expect(role("button", { name: "Edit" })).toBeAbsent(),
      expect(role("button", { name: "Delete" })).toBeAbsent(),
      expect(within(role("list", { name: "Messages" }), text("Plans for the week"))).toBeAbsent(),
      click(role("button", { name: "Cancel" })),
      expect(label("Edit")).toBeAbsent(),
      expect(role("button", { name: "Edit" })).toExist(),
      click(role("button", { name: "Edit" })),
      type(label("Edit"), "Plans for next week"),
      click(role("button", { name: "Save" })),
      Command.expectExact(
        EditMessage({ workspaceId, memberId, messageId: opening.id, text: "Plans for next week", expectedRevision: 1 })
      ),
      Command.resolve(EditMessage, Message.WroteAction()),
      click(role("button", { name: "Delete" })),
      Command.expectExact(DeleteMessage({ workspaceId, memberId, messageId: opening.id })),
      Command.resolve(DeleteMessage, Message.WroteAction())
    )
  })

  it("shows a mention in a message as a chip with the name the member has now, among the words around it", () => {
    const asked = saying(
      opening,
      `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the plans? Dana too: ${ThreadMessage.mentionText("member-9", "Dana")}`
    )

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: asked, pending: false }),
      expect(within(role("list", { name: "Messages" }), text("@Bob"))).toHaveText("@Bob"),
      expect(text("@Robert")).toBeAbsent(),
      expect(text(" can you check the plans? Dana too: ")).toExist(),
      // A member the thread's people do not hold keeps the name the mention recorded.
      expect(text("@Dana")).toHaveText("@Dana"),
      expect(text("@Bob can you check the plans? Dana too: @Dana")).toExist()
    )
  })

  it("says a message was deleted in its place, quiet and slanted", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: deleted(reply), pending: false }),
      expect(within(role("list", { name: "Messages" }), text("Message deleted"))).toExist(),
      expect(text("Message deleted")).toHaveClass("italic"),
      expect(text("Message deleted")).toHaveClass("text-ink-muted")
    )
  })

  it("says a message was edited after its text, quietly", () => {
    const edited = Schema.decodeSync(ThreadMessage.ThreadMessage)({
      ...Schema.encodeSync(ThreadMessage.ThreadMessage)(opening),
      content: {
        _tag: "Text",
        text: "Plans for next week",
        mentions: [],
        revision: 2,
        editedAt: "2026-10-18T12:30:00Z"
      }
    })

    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: edited, pending: false }),
      expect(text(" (edited)")).toHaveClass("text-meta"),
      expect(text(" (edited)")).toHaveClass("text-ink-muted"),
      expect(selector("li div.text-body")).toHaveText("Plans for next week (edited)")
    )
  })

  it("draws no message current unless one is highlighted, and mounts nothing to reveal one", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(selector("[aria-current]")).toBeAbsent(),
      Mount.expectNone()
    )
  })

  it("reveals the highlighted message once it is drawn, by a mount on its row alone", () => {
    const highlighted = (messageId: ThreadMessageId.ThreadMessageId) =>
      withViewInputs(view, { now, highlightedMessageId: Option.some(messageId) })()

    scene(
      { update, view: highlighted(reply.id), subscriptions: ThreadBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.thread,
        Message.ReceivedThread({
          hasThread: true,
          title: Option.none(),
          messages: [
            { message: opening, pending: false },
            { message: reply, pending: false }
          ],
          following: Option.none(),
          changes: [],
          latest: 0,
          readThrough: 0
        })
      ),
      Command.resolve(ScrollMessagesToEnd, Message.CompletedScrollMessagesToEnd()),
      Mount.expectExact(RevealHighlightedMessage),
      Mount.resolve(RevealHighlightedMessage, Message.CompletedRevealHighlightedMessage())
    )
  })

  it("reveals the highlighted description of a task, which is its opening, once it is drawn", () => {
    scene(
      {
        update,
        view: withViewInputs(view, { now, highlightedMessageId: Option.some(opening.id) })(),
        subscriptions: ThreadBlock.subscriptions
      },
      given(trackingTask),
      ...readHighlighted({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toExist()
    )
  })

  it("lists its messages under an id of the thread's, which the scroll that keeps them at their end finds them by", () => {
    scene(
      { update, view: sidePane, subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readWith({ message: opening, pending: false }),
      expect(role("list", { name: "Messages" })).toHaveAttr("id", "thread-messages-thread-1")
    )
  })

  it("draws the highlighted message current, and no other, as the notification's thread opens at it", () => {
    const highlighted = (messageId: ThreadMessageId.ThreadMessageId) =>
      withViewInputs(view, { now, highlightedMessageId: Option.some(messageId) })()

    scene(
      { update, view: highlighted(reply.id), subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readHighlighted({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(selector('[aria-current="true"]')).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Sounds good"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toBeAbsent()
    )
    scene(
      { update, view: highlighted(opening.id), subscriptions: ThreadBlock.subscriptions },
      given(opened),
      ...readHighlighted({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(within(selector('[aria-current="true"]'), text("Plans for the week"))).toExist(),
      expect(within(selector('[aria-current="true"]'), text("Sounds good"))).toBeAbsent()
    )
  })

  it("draws nothing current while the highlighted message is not in the thread", () => {
    scene(
      {
        update,
        view: withViewInputs(view, {
          now,
          highlightedMessageId: Option.some(ThreadMessageId.ThreadMessageId.make("message-9"))
        })(),
        subscriptions: ThreadBlock.subscriptions
      },
      given(opened),
      ...readWith({ message: opening, pending: false }, { message: reply, pending: false }),
      expect(selector("[aria-current]")).toBeAbsent()
    )
  })
})
