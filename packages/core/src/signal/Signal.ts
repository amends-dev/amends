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
    workspaceId: WorkspaceId.Id,
    groupId: GroupId.Id,
    threadId: ThreadId.Id,
    memberId: MemberId.Id,
    until: Schema.DateTimeUtcFromString
  },
  /**
   * A member read a thread through a position, for their sessions. Their notifications from the
   * thread at or before it are now seen, as each notification carries its thread and sequence.
   */
  ThreadRead: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    threadId: ThreadId.Id,
    readThrough: Schema.Int.check(Schema.isGreaterThan(0))
  },
  /** A member read a group: for their sessions. */
  GroupRead: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    groupId: GroupId.Id,
    readAt: Schema.DateTimeUtcFromString
  },
  /** A member saw notifications: for their sessions. */
  NotificationsSeen: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    notificationIds: Schema.NonEmptyArray(Notification.Id)
  },
  /**
   * More of a response an agent's turn is writing, before it completes: `text` continues the
   * response's part at `offset` characters. It reaches those following the turn's log, not the
   * workspace's change feed. A reader that missed earlier text waits for a draft from the part's
   * start, or for the completed response in the turn's log, which replaces the draft.
   */
  TurnDraft: {
    workspaceId: WorkspaceId.Id,
    groupId: GroupId.Id,
    threadId: ThreadId.Id,
    turnId: TurnId.Id,
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
  readonly workspaceId: WorkspaceId.Id
  readonly groupId: GroupId.Id
  readonly threadId: ThreadId.Id
}): Reach => ({
  audience: [Group.audienceOf(signal.groupId)],
  requirement: Requirement.make(ThreadPermissions.Read, {
    _tag: "Thread",
    workspaceId: signal.workspaceId,
    threadId: signal.threadId
  })
})

/**
 * Who on the workspace's change feed may receive a signal. Typing reaches the thread's readers, as
 * its messages do; read state reaches only its member's own sessions. A turn's drafts reach no
 * one there: only readers following its log, which checks their access itself.
 *
 * @category utils
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
