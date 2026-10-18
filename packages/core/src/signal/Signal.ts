/**
 * What a signal is: something happening now, told to the readers connected at the time and never
 * stored. `Signal` is the kinds a workspace publishes through its `SignalHub`, and
 * `changeFeedReachOf` says whom each reaches on the change feed, which `ChangeFeedService` checks
 * before it forwards one.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as Group from "../group/Group.ts"
import * as GroupId from "../group/GroupId.ts"
import type * as Audience from "../journal/Audience.ts"
import * as Notification from "../notification/Notification.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as Turn from "../turn/Turn.ts"
import * as TurnId from "../turn/TurnId.ts"
import * as Member from "../workspace/Member.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * Something happening now, for the readers connected at the time. Signals are never stored:
 * one missed is gone, and what it describes is either transient or read again from the stores.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Signal = Schema.TaggedUnion({
  /** A member is composing a message in a thread; readers show it until `until`. */
  Typing: {
    workspaceId: WorkspaceId.WorkspaceId,
    groupId: GroupId.GroupId,
    threadId: ThreadId.ThreadId,
    memberId: MemberId.MemberId,
    until: Schema.DateTimeUtcFromString
  },
  /**
   * A member read a thread through a position at `readAt`, for their sessions. Their notifications
   * from the thread at or before it that were still pending are now seen at `readAt`, as each
   * notification carries its thread and sequence.
   */
  ThreadRead: {
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    threadId: ThreadId.ThreadId,
    readThrough: Schema.Int.check(Schema.isGreaterThan(0)),
    readAt: Schema.DateTimeUtcFromString
  },
  /** A member read a group: for their sessions. */
  GroupRead: {
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    groupId: GroupId.GroupId,
    readAt: Schema.DateTimeUtcFromString
  },
  /** A member saw notifications, which were pending until `seenAt`: for their sessions. */
  NotificationsSeen: {
    workspaceId: WorkspaceId.WorkspaceId,
    memberId: MemberId.MemberId,
    notificationIds: Schema.NonEmptyArray(Notification.NotificationId),
    seenAt: Schema.DateTimeUtcFromString
  },
  /**
   * More of a response an agent's turn is writing, before it completes: `text` continues the
   * response's part at `offset` characters. It reaches those following the turn's log, not the
   * workspace's change feed. A reader that missed earlier text waits for a draft from the part's
   * start, or for the completed response in the turn's log, which replaces the draft.
   */
  TurnDraft: {
    workspaceId: WorkspaceId.WorkspaceId,
    groupId: GroupId.GroupId,
    threadId: ThreadId.ThreadId,
    turnId: TurnId.TurnId,
    draft: Turn.Draft
  }
}).annotate({ identifier: "Signal" })
/**
 * @category schemas
 * @since 0.1.0
 */
export type Signal = typeof Signal.Type

/**
 * Who may receive a signal: its scopes, and any read permission a reader also needs.
 *
 * @category models
 * @since 0.1.0
 */
export interface Reach {
  readonly audience: Audience.Audience
  readonly requirement: Requirement.Requirement | undefined
}

/** Readers of a thread: its group's audience, who may read the thread. */
const threadReaders = (signal: {
  readonly workspaceId: WorkspaceId.WorkspaceId
  readonly groupId: GroupId.GroupId
  readonly threadId: ThreadId.ThreadId
}): Reach => ({
  audience: [Group.audienceOf(signal.groupId)],
  requirement: Requirement.make(
    ThreadPermissions.Read,
    Target.Reference.cases.Thread.make({ workspaceId: signal.workspaceId, threadId: signal.threadId })
  )
})

/**
 * Who on the workspace's change feed may receive a signal. Typing reaches the thread's readers, as
 * its messages do; read state reaches only its member's own sessions. A turn's drafts reach no
 * one there: only readers following its log, which checks their access itself.
 *
 * @category getters
 * @since 0.1.0
 */
export const changeFeedReachOf = (signal: Signal): Reach | undefined =>
  Signal.match(signal, {
    Typing: threadReaders,
    TurnDraft: () => undefined,
    ThreadRead: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined
    }),
    GroupRead: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined
    }),
    NotificationsSeen: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined
    })
  })
