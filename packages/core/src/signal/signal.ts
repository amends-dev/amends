import { Schema } from "effect";
import { Requirement } from "../authorization/requirement.ts";
import { Group } from "../group/group.ts";
import { GroupId } from "../group/id.ts";
import { Audience } from "../journal/audience.ts";
import { Notification } from "../notification/notification.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberId } from "../workspace/member/id.ts";

/**
 * Something happening now, for the readers connected at the time. Signals are never stored:
 * one missed is gone, and what it describes is either transient or read again from the stores.
 */
export const Value = Schema.TaggedUnion({
  /** A member is composing a message in a thread; readers show it until `until`. */
  Typing: {
    workspaceId: WorkspaceId.Id,
    groupId: GroupId.Id,
    threadId: ThreadId.Id,
    memberId: MemberId.Id,
    until: Schema.DateTimeUtcFromString,
  },
  /**
   * A member read a thread through a position, for their sessions. Their notifications from the
   * thread at or before it are now seen, as each notification carries its thread and sequence.
   */
  ThreadRead: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    threadId: ThreadId.Id,
    readThrough: Schema.Int.check(Schema.isGreaterThan(0)),
  },
  /** A member caught up with a group: for their sessions. */
  GroupCaughtUp: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    groupId: GroupId.Id,
    caughtUpAt: Schema.DateTimeUtcFromString,
  },
  /** A member saw notifications: for their sessions. */
  NotificationsSeen: {
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    notificationIds: Schema.NonEmptyArray(Notification.Id),
  },
}).annotate({ identifier: "Signal" });
export type Value = typeof Value.Type;

/** Who may receive a signal: its scopes, and any read permission a reader also needs. */
export interface Reach {
  readonly audience: Audience.Value;
  readonly requirement: Requirement.Value | undefined;
}

/**
 * Typing reaches the thread's readers, as its messages do; read state reaches only its member's
 * own sessions.
 */
export const reachOf = (signal: Value): Reach =>
  Value.match(signal, {
    Typing: ({ workspaceId, groupId, threadId }): Reach => ({
      audience: [Group.audienceOf(groupId)],
      requirement: Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId,
      }),
    }),
    ThreadRead: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined,
    }),
    GroupCaughtUp: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined,
    }),
    NotificationsSeen: ({ memberId }): Reach => ({
      audience: [Member.audienceOf(memberId)],
      requirement: undefined,
    }),
  });

export * as Signal from "./signal.ts";
