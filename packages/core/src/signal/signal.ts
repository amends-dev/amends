import { Schema } from "effect";
import { Requirement } from "../authorization/requirement.ts";
import { Group } from "../group/group.ts";
import { GroupId } from "../group/id.ts";
import { Audience } from "../journal/audience.ts";
import { Notification } from "../notification/notification.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { TurnId } from "../turn/id.ts";
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
  /**
   * More of a response an agent's turn is writing, before it completes: `text` continues the
   * response's part at `offset` characters. A reader that missed earlier text waits for the
   * completed response in the turn's log, which replaces the draft.
   */
  TurnDraft: {
    workspaceId: WorkspaceId.Id,
    groupId: GroupId.Id,
    threadId: ThreadId.Id,
    turnId: TurnId.Id,
    responseId: Schema.NonEmptyString,
    part: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    text: Schema.String,
  },
  /** A turn's log gained entries, such as a completed response, for its readers to read again. */
  TurnLogged: {
    workspaceId: WorkspaceId.Id,
    groupId: GroupId.Id,
    threadId: ThreadId.Id,
    turnId: TurnId.Id,
  },
}).annotate({ identifier: "Signal" });
export type Value = typeof Value.Type;

/** Who may receive a signal: its scopes, and any read permission a reader also needs. */
export interface Reach {
  readonly audience: Audience.Value;
  readonly requirement: Requirement.Value | undefined;
}

/** Readers of a thread: its group's audience, who may read the thread. */
const threadReaders = (signal: {
  readonly workspaceId: WorkspaceId.Id;
  readonly groupId: GroupId.Id;
  readonly threadId: ThreadId.Id;
}): Reach => ({
  audience: [Group.audienceOf(signal.groupId)],
  requirement: Requirement.make(ThreadPermissions.Read, {
    _tag: "Thread",
    workspaceId: signal.workspaceId,
    threadId: signal.threadId,
  }),
});

/**
 * Typing and turns' progress reach the thread's readers, as its messages do; read state reaches
 * only its member's own sessions.
 */
export const reachOf = (signal: Value): Reach =>
  Value.match(signal, {
    Typing: threadReaders,
    TurnDraft: threadReaders,
    TurnLogged: threadReaders,
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
