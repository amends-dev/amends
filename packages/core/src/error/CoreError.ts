/**
 * The outcomes core reports by kind, whichever operation raises them. Each says in its fields what
 * it is about and in its `message` what happened, so a protocol or client handles a kind once,
 * however many operations report it, and a new operation adds no mapping: `NotFound`, for anything
 * the caller named that is missing or out of their reach; `Changed`, for what changed since the
 * caller read it; `Denied`, for who may not do what they asked; `Conflict`, for a request the
 * state of what it acts on refuses; `Invalid`, for a request that cannot be done as asked whatever
 * the state; and `Unavailable`, for what an operation needs that cannot be reached or used now.
 * The last four say why in their `reason`, as `NotGranted` or `AlreadyMember`, so a caller
 * recovers from one reason with
 * `Effect.catchReason("CoreError.Denied", "NotGranted", ...)`.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Agent from "../agent/Agent.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as Role from "../authorization/Role.ts";
import * as Connection from "../connection/Connection.ts";
import * as GroupId from "../group/GroupId.ts";
import * as Identity from "../identity/Identity.ts";
import * as Notification from "../notification/Notification.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as Turn from "../turn/Turn.ts";
import * as Invitation from "../workspace/Invitation.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as WorkspaceId from "../workspace/WorkspaceId.ts";

/**
 * What an error names, as core's modules name it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Resource = Schema.Literals([
  "Agent",
  "Assignment",
  "Channel",
  "ChannelBinding",
  "Connection",
  "Group",
  "GroupMembership",
  "Invitation",
  "Member",
  "Notification",
  "Role",
  "Task",
  "Thread",
  "ThreadMessage",
  "ThreadParticipation",
  "Turn",
  "Workspace",
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Resource = typeof Resource.Type;

/**
 * The caller named something that is missing, or out of their reach, as a thread outside their
 * groups is; the two are not told apart, so no caller learns what exists beyond what they may
 * read. `id` is the ID the caller named, or that the operation reached it by: a thread's task by
 * the thread's ID, and a thread's binding to a channel by the thread's.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("CoreError.NotFound", {
  resource: Resource,
  id: Schema.String,
}) {
  override get message(): string {
    return `${this.resource} ${this.id} not found`;
  }
}

/**
 * What the caller expected of a resource, such as the name, title, revision, or roles they last
 * read, is no longer so: someone changed it meanwhile, and nothing was recorded. Reading it again
 * and asking against what it is now may succeed.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("CoreError.Changed", {
  resource: Resource,
  id: Schema.String,
}) {
  override get message(): string {
    return `${this.resource} ${this.id} changed since it was read`;
  }
}

/**
 * No current grant of the member covers the requirement: the permission, on its target.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotGranted extends Schema.TaggedClass<NotGranted>()("NotGranted", {
  memberId: MemberId.Id,
  requirement: Requirement.Requirement,
}) {
  get message(): string {
    return `Member ${this.memberId} holds no grant of ${this.requirement.permission.name}`;
  }
}

/**
 * The identity holds no active membership of the workspace, or no workspace has this ID; the two
 * are not told apart, and the gateway answers it before loading the workspace.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotMember extends Schema.TaggedClass<NotMember>()("NotMember", {
  workspaceId: WorkspaceId.Id,
}) {
  get message(): string {
    return `Not a member of workspace ${this.workspaceId}`;
  }
}

/**
 * The acting membership cannot act: it is missing, removed, or not the acting identity's.
 *
 * @category reasons
 * @since 0.1.0
 */
export class InvalidActor extends Schema.TaggedClass<InvalidActor>()("InvalidActor", {
  memberId: MemberId.Id,
  reason: Schema.Literals(["membership-missing", "membership-removed", "identity-mismatch"]),
}) {
  get message(): string {
    return `Member ${this.memberId} cannot act: ${this.reason}`;
  }
}

/**
 * Only the workspace's owner, as a person, may do this, whatever grants the actor holds: give
 * Administrator (`administrator-role`), change a member who holds a direct grant or a role other
 * than Member (`protected-member`), or transfer ownership (`ownership-transfer`).
 *
 * @category reasons
 * @since 0.1.0
 */
export class OwnerRequired extends Schema.TaggedClass<OwnerRequired>()("OwnerRequired", {
  reason: Schema.Literals(["administrator-role", "protected-member", "ownership-transfer"]),
}) {
  get message(): string {
    return `Only the owner may do this: ${this.reason}`;
  }
}

/**
 * Someone other than the message's author asked to edit it; only its author edits a message.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotAuthor extends Schema.TaggedClass<NotAuthor>()("NotAuthor", {
  messageId: ThreadMessageId.Id,
}) {
  get message(): string {
    return `Only the author edits message ${this.messageId}`;
  }
}

/**
 * The authenticated person is not whom the invitation names; only its recipient accepts it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotRecipient extends Schema.TaggedClass<NotRecipient>()("NotRecipient", {
  invitationId: Invitation.Id,
}) {
  get message(): string {
    return `Invitation ${this.invitationId} is for someone else`;
  }
}

/**
 * An agent asked for what only a person does: starting a thread or publishing outside its turns,
 * keeping read state, marking notifications seen, or creating a workspace. Agents' messages come
 * from their turns, which track their input themselves.
 *
 * @category reasons
 * @since 0.1.0
 */
export class HumanRequired extends Schema.TaggedClass<HumanRequired>()("HumanRequired", {}) {
  get message(): string {
    return "Only a person may do this";
  }
}

/**
 * Only an agent can be made to follow, or stop following, by another member; people follow for
 * themselves.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AgentRequired extends Schema.TaggedClass<AgentRequired>()("AgentRequired", {
  memberId: MemberId.Id,
}) {
  get message(): string {
    return `Member ${this.memberId} is not an agent`;
  }
}

/**
 * Why the actor was denied: one of the reasons above.
 *
 * @category schemas
 * @since 0.1.0
 */
export const DeniedReason = Schema.Union([
  NotGranted,
  NotMember,
  InvalidActor,
  OwnerRequired,
  NotAuthor,
  NotRecipient,
  HumanRequired,
  AgentRequired,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type DeniedReason = typeof DeniedReason.Type;

/**
 * The actor may not do what they asked, for the `reason` given; nothing was recorded.
 *
 * **Example** (Treating a missing grant as not allowed)
 *
 * ```ts
 * import type { CoreError } from "@amends-dev/core/error";
 * import { Effect } from "effect";
 *
 * declare const check: Effect.Effect<void, CoreError.Denied>;
 *
 * const allowed = check.pipe(
 *   Effect.as(true),
 *   Effect.catchReason("CoreError.Denied", "NotGranted", () => Effect.succeed(false)),
 * );
 * ```
 *
 * @category errors
 * @since 0.1.0
 */
export class Denied extends Schema.TaggedError<Denied>()("CoreError.Denied", {
  reason: DeniedReason,
}) {
  override get message(): string {
    return this.reason.message;
  }
}

/**
 * Another writer held the workspace's storage, so the operation did not apply; asking again may
 * succeed. `operation` names the storage operation that met it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Contention extends Schema.TaggedClass<Contention>()("Contention", {
  operation: Schema.String,
  description: Schema.String,
}) {
  get message(): string {
    return this.description;
  }
}

/**
 * Another host changed which read models this workspace runs, so the operation did not apply;
 * asking again once they are rebuilt succeeds.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Reloading extends Schema.TaggedClass<Reloading>()("Reloading", {}) {
  get message(): string {
    return "Another host changed this workspace's read models; try again once they are rebuilt";
  }
}

/**
 * The change feed stopped; the reader subscribes again and refreshes what it shows.
 *
 * @category reasons
 * @since 0.1.0
 */
export class ChangeFeedInterrupted extends Schema.TaggedClass<ChangeFeedInterrupted>()(
  "ChangeFeedInterrupted",
  {},
) {
  get message(): string {
    return "The change feed stopped; subscribe again and refresh";
  }
}

/**
 * Following a turn's log stopped short; the reader follows it again from the start.
 *
 * @category reasons
 * @since 0.1.0
 */
export class LogInterrupted extends Schema.TaggedClass<LogInterrupted>()("LogInterrupted", {}) {
  get message(): string {
    return "Following the turn's log stopped short; follow it again from the start";
  }
}

/**
 * A channel's external system cannot be reached as the channel stands, as `description` says: its
 * connection was removed or has no key, its integration is not installed or gives no channels, or
 * the system could not answer.
 *
 * @category reasons
 * @since 0.1.0
 */
export class ChannelUnreachable extends Schema.TaggedClass<ChannelUnreachable>()(
  "ChannelUnreachable",
  { description: Schema.String },
) {
  get message(): string {
    return this.description;
  }
}

/**
 * This host keeps no credentials, as when it has no key to protect them with, so no key can be
 * stored or read.
 *
 * @category reasons
 * @since 0.1.0
 */
export class CredentialsUnavailable extends Schema.TaggedClass<CredentialsUnavailable>()(
  "CredentialsUnavailable",
  { description: Schema.String },
) {
  get message(): string {
    return this.description;
  }
}

/**
 * Why what an operation needs is unavailable: one of the reasons above.
 *
 * @category schemas
 * @since 0.1.0
 */
export const UnavailableReason = Schema.Union([
  Contention,
  Reloading,
  ChangeFeedInterrupted,
  LogInterrupted,
  ChannelUnreachable,
  CredentialsUnavailable,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type UnavailableReason = typeof UnavailableReason.Type;

/**
 * What the operation needs cannot be reached or used now, for the `reason` given; nothing was
 * recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("CoreError.Unavailable", {
  reason: UnavailableReason,
}) {
  override get message(): string {
    return this.reason.message;
  }
}

/**
 * The member is no longer active in the workspace: roles, groups, and new teams take active
 * members only.
 *
 * @category reasons
 * @since 0.1.0
 */
export class InactiveMember extends Schema.TaggedClass<InactiveMember>()("InactiveMember", {
  memberId: MemberId.Id,
}) {
  get message(): string {
    return `Member ${this.memberId} is no longer active`;
  }
}

/**
 * A member who was to take part cannot: they are missing, inactive, or not in the group, as a
 * mention, an assignee, a new direct group's member, or a member made to follow may be.
 *
 * @category reasons
 * @since 0.1.0
 */
export class ParticipantUnavailable extends Schema.TaggedClass<ParticipantUnavailable>()(
  "ParticipantUnavailable",
  { memberId: MemberId.Id },
) {
  get message(): string {
    return `Member ${this.memberId} cannot take part`;
  }
}

/**
 * The owner is out of reach: Owner is given by transferring ownership alone, and no one changes the
 * owner's roles or removes the owner until ownership moves.
 *
 * @category reasons
 * @since 0.1.0
 */
export class OwnerProtected extends Schema.TaggedClass<OwnerProtected>()("OwnerProtected", {}) {
  get message(): string {
    return "The owner is out of reach until ownership is transferred";
  }
}

/**
 * The member holds an active admission to the group already; nothing is recorded.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AlreadyMember extends Schema.TaggedClass<AlreadyMember>()("AlreadyMember", {
  groupId: GroupId.Id,
  memberId: MemberId.Id,
}) {
  get message(): string {
    return `Member ${this.memberId} is in group ${this.groupId} already`;
  }
}

/**
 * The person holds an active membership of the workspace already, so they are neither invited
 * nor accept an invitation.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AlreadyJoined extends Schema.TaggedClass<AlreadyJoined>()("AlreadyJoined", {
  recipientId: Identity.HumanId,
}) {
  get message(): string {
    return "This person is a member of the workspace already";
  }
}

/**
 * What the request ends has ended already: a member removed, an admission ended, or a
 * participation ended. Repeating it records nothing.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AlreadyEnded extends Schema.TaggedClass<AlreadyEnded>()("AlreadyEnded", {
  resource: Resource,
  id: Schema.String,
}) {
  get message(): string {
    return `${this.resource} ${this.id} has ended already`;
  }
}

/**
 * The notification no longer waits for its recipient: it was discarded, or settled some other
 * way, so it is not marked seen.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AlreadyHandled extends Schema.TaggedClass<AlreadyHandled>()("AlreadyHandled", {
  notificationId: Notification.Id,
}) {
  get message(): string {
    return `Notification ${this.notificationId} was handled already`;
  }
}

/**
 * The thread is a task already; a thread has one.
 *
 * @category reasons
 * @since 0.1.0
 */
export class AlreadyTask extends Schema.TaggedClass<AlreadyTask>()("AlreadyTask", {
  threadId: ThreadId.Id,
}) {
  get message(): string {
    return `Thread ${this.threadId} is a task already`;
  }
}

/**
 * The message was deleted, so it has no text to edit.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Deleted extends Schema.TaggedClass<Deleted>()("Deleted", {
  messageId: ThreadMessageId.Id,
}) {
  get message(): string {
    return `Message ${this.messageId} was deleted`;
  }
}

/**
 * The turn has finished already, or is not in the state the operation needs, as `status` says.
 *
 * @category reasons
 * @since 0.1.0
 */
export class TurnNotActive extends Schema.TaggedClass<TurnNotActive>()("TurnNotActive", {
  turnId: Turn.Id,
  status: Turn.Status,
}) {
  get message(): string {
    return `Turn ${this.turnId} is ${this.status}`;
  }
}

/**
 * The turn cannot be retried now, as `reason` says: it is still active, it completed, a later
 * turn of its agent superseded it, or its agent no longer takes part.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotRetryable extends Schema.TaggedClass<NotRetryable>()("NotRetryable", {
  turnId: Turn.Id,
  reason: Turn.NotRetryableReason,
}) {
  get message(): string {
    return `Turn ${this.turnId} cannot be retried: ${this.reason}`;
  }
}

/**
 * The read position asked for is past the thread's latest recorded activity.
 *
 * @category reasons
 * @since 0.1.0
 */
export class BeyondTimeline extends Schema.TaggedClass<BeyondTimeline>()("BeyondTimeline", {
  threadId: ThreadId.Id,
  throughSequence: Schema.Int,
  latestSequence: Schema.Int,
}) {
  get message(): string {
    return `Thread ${this.threadId} ends at ${this.latestSequence}, before ${this.throughSequence}`;
  }
}

/**
 * The member cannot become owner: they are the owner already, removed, or an agent, as `reason`
 * says.
 *
 * @category reasons
 * @since 0.1.0
 */
export class InvalidRecipient extends Schema.TaggedClass<InvalidRecipient>()("InvalidRecipient", {
  memberId: MemberId.Id,
  reason: Schema.Literals(["same-owner", "removed", "agent"]),
}) {
  get message(): string {
    return `Member ${this.memberId} cannot become owner: ${this.reason}`;
  }
}

/**
 * The invitation cannot be accepted or revoked now: it has expired, was revoked, or was accepted
 * already, as `reason` says.
 *
 * @category reasons
 * @since 0.1.0
 */
export class InvitationClosed extends Schema.TaggedClass<InvitationClosed>()("InvitationClosed", {
  invitationId: Invitation.Id,
  reason: Schema.Literals(["expired", "revoked", "accepted"]),
}) {
  get message(): string {
    return `Invitation ${this.invitationId} is ${this.reason}`;
  }
}

/**
 * Why the state of what a request acts on refuses it: one of the reasons above.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ConflictReason = Schema.Union([
  InactiveMember,
  ParticipantUnavailable,
  OwnerProtected,
  AlreadyMember,
  AlreadyJoined,
  AlreadyEnded,
  AlreadyHandled,
  AlreadyTask,
  Deleted,
  TurnNotActive,
  NotRetryable,
  BeyondTimeline,
  InvalidRecipient,
  InvitationClosed,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type ConflictReason = typeof ConflictReason.Type;

/**
 * The state of what the request acts on refuses it, for the `reason` given, as a member already
 * admitted or a turn already finished; nothing was recorded. What the caller sees may be out of
 * date.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("CoreError.Conflict", {
  reason: ConflictReason,
}) {
  override get message(): string {
    return this.reason.message;
  }
}

/**
 * Values the caller gave do not hold: they fail what core accepts, or name another workspace's
 * records. The description says which.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Malformed extends Schema.TaggedClass<Malformed>()("Malformed", {
  description: Schema.String,
}) {
  get message(): string {
    return this.description;
  }
}

/**
 * The role is not one of the three built-in ones; no other role is delegated.
 *
 * @category reasons
 * @since 0.1.0
 */
export class UnsupportedRole extends Schema.TaggedClass<UnsupportedRole>()("UnsupportedRole", {
  roleId: Role.Id,
}) {
  get message(): string {
    return `Role ${this.roleId} is not a built-in role`;
  }
}

/**
 * The expiry given is not after now.
 *
 * @category reasons
 * @since 0.1.0
 */
export class PastExpiry extends Schema.TaggedClass<PastExpiry>()("PastExpiry", {}) {
  get message(): string {
    return "The expiry is not after now";
  }
}

/**
 * A direct group needs the author and at least one other member.
 *
 * @category reasons
 * @since 0.1.0
 */
export class DirectMembersRequired extends Schema.TaggedClass<DirectMembersRequired>()(
  "DirectMembersRequired",
  {},
) {
  get message(): string {
    return "A direct group needs the author and at least one other member";
  }
}

/**
 * A direct group is named by its members, so it takes no name.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotRenamable extends Schema.TaggedClass<NotRenamable>()("NotRenamable", {
  groupId: GroupId.Id,
}) {
  get message(): string {
    return `Group ${this.groupId} is named by its members`;
  }
}

/**
 * A direct group's members are fixed: nobody is added to it, removed from it, or leaves it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class FixedMembership extends Schema.TaggedClass<FixedMembership>()("FixedMembership", {
  groupId: GroupId.Id,
}) {
  get message(): string {
    return `Group ${this.groupId} has fixed members`;
  }
}

/**
 * Everyone in the workspace belongs to its general group: nobody leaves it or is removed from it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class GeneralMembership extends Schema.TaggedClass<GeneralMembership>()(
  "GeneralMembership",
  {
    groupId: GroupId.Id,
  },
) {
  get message(): string {
    return `Everyone belongs to the general group ${this.groupId}`;
  }
}

/**
 * Everyone in a direct group takes part in its threads, so it has nothing to follow.
 *
 * @category reasons
 * @since 0.1.0
 */
export class NotFollowable extends Schema.TaggedClass<NotFollowable>()("NotFollowable", {
  groupId: GroupId.Id,
}) {
  get message(): string {
    return `Group ${this.groupId} has nothing to follow`;
  }
}

/**
 * Everyone in a direct conversation takes part in it, so nobody follows or unfollows it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class FixedParticipation extends Schema.TaggedClass<FixedParticipation>()(
  "FixedParticipation",
  {
    threadId: ThreadId.Id,
  },
) {
  get message(): string {
    return `Everyone takes part in thread ${this.threadId}`;
  }
}

/**
 * This host does not install the integration, or no longer installs the one a connection names.
 *
 * @category reasons
 * @since 0.1.0
 */
export class UnknownIntegration extends Schema.TaggedClass<UnknownIntegration>()(
  "UnknownIntegration",
  {
    integration: Schema.String,
  },
) {
  get message(): string {
    return `This host does not install ${this.integration}`;
  }
}

/**
 * The integration does not take the connection: its settings, how it authenticates, or, when
 * checking one that authenticates with a key, a missing key. The description is the integration's,
 * for the person who gave them.
 *
 * @category reasons
 * @since 0.1.0
 */
export class IntegrationRefused extends Schema.TaggedClass<IntegrationRefused>()(
  "IntegrationRefused",
  {
    description: Schema.String,
  },
) {
  get message(): string {
    return this.description;
  }
}

/**
 * The connection authenticates with nothing, so it takes no key.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Keyless extends Schema.TaggedClass<Keyless>()("Keyless", {
  connectionId: Connection.Id,
}) {
  get message(): string {
    return `Connection ${this.connectionId} takes no key`;
  }
}

const describeIssue = (issue: Agent.Issue): string => {
  switch (issue._tag) {
    case "Removed":
      return `The connection for the agent's ${issue.part} was removed.`;
    case "Uninstalled":
      return `The integration of the agent's ${issue.part} connection is not installed here.`;
    case "Invalid":
      return issue.description;
    case "SandboxRequired":
      return "The agent's harness works only in a sandbox, and the agent has none.";
    case "NoHarness":
      return "No connection gives a harness the agent can run on.";
  }
};

/**
 * The agent cannot run as it would be set up, for the issues its readiness reports.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Incomplete extends Schema.TaggedClass<Incomplete>()("Incomplete", {
  issues: Schema.NonEmptyArray(Agent.Issue),
}) {
  get message(): string {
    return this.issues.map(describeIssue).join(" ");
  }
}

/**
 * A connection the request names is missing or removed, the actor may not read and use it, or it
 * gives nothing for its use, which they cannot tell apart. `part` names the part of an agent's
 * setup that names it.
 *
 * @category reasons
 * @since 0.1.0
 */
export class ConnectionUnusable extends Schema.TaggedClass<ConnectionUnusable>()(
  "ConnectionUnusable",
  {
    connectionId: Connection.Id,
    part: Schema.optional(Agent.Part),
  },
) {
  get message(): string {
    return `Connection ${this.connectionId} cannot be used here`;
  }
}

/**
 * The channel's transport rejected what the host received: it is not the external system's, or
 * its signature does not hold. Nothing was taken in.
 *
 * @category reasons
 * @since 0.1.0
 */
export class Unverified extends Schema.TaggedClass<Unverified>()("Unverified", {
  description: Schema.String,
}) {
  get message(): string {
    return this.description;
  }
}

/**
 * Why a request cannot be done as asked: one of the reasons above.
 *
 * @category schemas
 * @since 0.1.0
 */
export const InvalidReason = Schema.Union([
  Malformed,
  UnsupportedRole,
  PastExpiry,
  DirectMembersRequired,
  NotRenamable,
  FixedMembership,
  GeneralMembership,
  NotFollowable,
  FixedParticipation,
  UnknownIntegration,
  IntegrationRefused,
  Keyless,
  Incomplete,
  ConnectionUnusable,
  Unverified,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type InvalidReason = typeof InvalidReason.Type;

/**
 * The request cannot be done as asked, whatever the state, for the `reason` given, such as values
 * that do not hold, a role or integration this workspace does not have, a fixed roster, or a setup
 * that cannot run; asking again unchanged fails the same. Nothing was recorded.
 *
 * @category errors
 * @since 0.1.0
 */
export class Invalid extends Schema.TaggedError<Invalid>()("CoreError.Invalid", {
  reason: InvalidReason,
}) {
  override get message(): string {
    return this.reason.message;
  }
}
