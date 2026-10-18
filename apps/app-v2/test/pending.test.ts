import { CoreError } from "@amends-dev/core/error"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { Thread, ThreadId, ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as ThreadSync from "@amends-dev/sync/ThreadSync"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import * as Pending from "../src/sync/Pending.ts"

const { cases } = ReplicaRecord.ReplicaRecord
const author = {
  workspaceId: WorkspaceId.WorkspaceId.make("workspace-1"),
  memberId: MemberId.MemberId.make("member-1")
}
const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 18, 12, minute))
const group = ReplicaRecord.Place.cases.Group.make({ groupId: "general" as never })

const thread = (id: string, title: string | null = null) =>
  cases.Thread.make({
    value: Schema.decodeSync(Thread.Thread)({
      id,
      workspaceId: "workspace-1",
      groupId: "general",
      title,
      origin: null,
      createdBy: { _tag: "Member", memberId: "member-1" },
      createdAt: "2026-10-18T12:00:00Z"
    })
  })
const message = (id: string, text: string) =>
  cases.ThreadMessage.make({
    value: Schema.decodeSync(ThreadMessage.ThreadMessage)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      author: { _tag: "Member", memberId: "member-1" },
      via: null,
      publishedAt: "2026-10-18T12:00:00Z",
      content: { _tag: "Text", text, mentions: [], revision: 1, editedAt: null }
    })
  })

/** An unfinished action `tag` with `payload`, written at `minute`, creating `creates`. */
const unfinished = (
  tag: string,
  payload: unknown,
  minute: number,
  creates: ReadonlyArray<ReplicaRecord.ReplicaRecord> = []
): Pending.Unfinished => ({
  action: { ...author, key: Request.Key.make(`action-${minute}`), writtenAt: at(minute) },
  payload,
  effects: Pending.effectsOf(tag),
  creates
})
const view = <Kind extends ReplicaRecord.Kind>(
  held: ReadonlyArray<Pending.Held<Pending.Held["record"] & { _tag: Kind }>>
) => held.map(({ record, pending }) => ({ value: record.value, pending }))

describe("Pending.overlay", () => {
  it("shows what an action creates until the server holds it, and its changes over what the server holds", () => {
    const server = thread("thread-1")
    const started = thread("thread-2", "New")
    const pending = [
      unfinished("ThreadRenamed", { threadId: "thread-1", title: "Plans", expectedTitle: null }, 1),
      unfinished("ThreadStarted", { groupId: "general", text: "Hi", mentions: [] }, 2, [started])
    ]
    expect(view(Pending.overlay("Thread", group, [server], pending))).toEqual([
      { value: { ...server.value, title: "Plans" }, pending: true },
      { value: started.value, pending: true }
    ])
    // Once the server holds the thread it started, the server's own shows, under the same ID.
    const arrived = thread("thread-2", "New, as the server made it")
    expect(view(Pending.overlay("Thread", group, [arrived], pending.slice(1)))).toEqual([
      { value: arrived.value, pending: false }
    ])
  })

  it("applies each action to what the ones before it left", () => {
    const started = thread("thread-2")
    const pending = [
      unfinished("ThreadStarted", { groupId: "general", text: "Hi", mentions: [] }, 1, [started]),
      unfinished("ThreadRenamed", { threadId: "thread-2", title: "Named", expectedTitle: null }, 2)
    ]
    expect(view(Pending.overlay("Thread", group, [], pending))).toEqual([
      { value: { ...started.value, title: "Named" }, pending: true }
    ])
  })

  it("edits and deletes the messages it names, as of when it was written", () => {
    const place = ReplicaRecord.Place.cases.Thread.make({ threadId: ThreadId.ThreadId.make("thread-1") })
    const first = message("message-1", "Draft")
    const second = message("message-2", "Oops")
    const pending = [
      unfinished(
        "ThreadMessageEdited",
        { messageId: "message-1", text: "Final", mentions: [], expectedRevision: 1 },
        3
      ),
      unfinished("ThreadMessageDeleted", { messageId: "message-2" }, 4)
    ]
    expect(view(Pending.overlay("ThreadMessage", place, [first, second], pending))).toEqual([
      {
        value: {
          ...first.value,
          content: ThreadMessage.Content.cases.Text.make({ text: "Final", mentions: [], revision: 2, editedAt: at(3) })
        },
        pending: true
      },
      {
        value: { ...second.value, content: ThreadMessage.Content.cases.Deleted.make({ deletedAt: at(4) }) },
        pending: true
      }
    ])
  })
})

describe("Pending.overlay, for a member's own part in a thread", () => {
  const place = ReplicaRecord.Place.cases.Thread.make({ threadId: ThreadId.ThreadId.make("thread-1") })
  const position = (readThrough: number) =>
    cases.ThreadPosition.make({ value: { ...author, threadId: ThreadId.ThreadId.make("thread-1"), readThrough } })
  const participation = (status: "active" | "ended") =>
    cases.ThreadParticipation.make({
      value: Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
        id: "participation-1",
        workspaceId: "workspace-1",
        threadId: "thread-1",
        participant: {
          _tag: "Member",
          memberId: "member-1",
          groupMembershipId: "membership-1",
          identity: { _tag: "Human", id: "alice" }
        },
        joinedAt: "2026-10-18T12:00:00Z",
        joinedAtSequence: 1,
        status,
        endedAt: status === "ended" ? "2026-10-18T12:30:00Z" : null
      })
    })

  it("reads a thread through the furthest position, from none or from one the server holds", () => {
    const marked = (through: number, minute: number) =>
      unfinished("ThreadMarkedRead", { threadId: "thread-1", throughSequence: through }, minute, [position(through)])
    expect(view(Pending.overlay("ThreadPosition", place, [], [marked(3, 1)]))).toEqual([
      { value: position(3).value, pending: true }
    ])
    expect(view(Pending.overlay("ThreadPosition", place, [position(2)], [marked(5, 1)]))).toEqual([
      { value: position(5).value, pending: true }
    ])
    // A position behind the one the server holds leaves it as it is.
    expect(view(Pending.overlay("ThreadPosition", place, [position(6)], [marked(5, 1)]))).toEqual([
      { value: position(6).value, pending: false }
    ])
  })

  it("ends the member's participation, and takes up one they ended", () => {
    const unfollowed = unfinished("ThreadUnfollowed", { threadId: "thread-1", participationId: "participation-1" }, 2)
    expect(view(Pending.overlay("ThreadParticipation", place, [participation("active")], [unfollowed]))).toEqual([
      { value: { ...participation("active").value, status: "ended", endedAt: at(2) }, pending: true }
    ])
    const followed = unfinished("ThreadFollowed", { threadId: "thread-1" }, 3)
    expect(view(Pending.overlay("ThreadParticipation", place, [participation("ended")], [followed]))).toEqual([
      { value: participation("active").value, pending: true }
    ])
  })
})

describe("Pending.unfinished", () => {
  it.effect("decodes the actions still on their way, in the order written, and leaves out those refused", () =>
    Effect.gen(function* () {
      const renamed = ThreadSync.Actions.events.ThreadRenamed!
      const encode = Schema.encodeEffect(renamed.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)
      const held = (key: string, title: string, refused: boolean) =>
        Effect.map(encode({ threadId: "thread-1", title, expectedTitle: null }), (payload) => ({
          key,
          tag: "ThreadRenamed",
          payload,
          writtenAt: at(0),
          creates: [],
          rejection: refused
            ? Option.some(new CoreError.Denied({ reason: new CoreError.HumanRequired() }))
            : Option.none()
        }))
      const actions = yield* Effect.all([
        held("b", "Second", false),
        held("a", "First", false),
        held("c", "Refused", true)
      ])
      const pending = yield* Pending.unfinished(actions, author)
      expect(pending.map(({ action, payload }) => [action.key, (payload as { title: string }).title])).toEqual([
        ["a", "First"],
        ["b", "Second"]
      ])
      expect(view(Pending.overlay("Thread", group, [thread("thread-1")], pending))).toEqual([
        { value: { ...thread("thread-1").value, title: "Second" }, pending: true }
      ])
    })
  )
})
