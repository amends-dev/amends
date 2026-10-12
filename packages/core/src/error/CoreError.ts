/**
 * The outcomes core reports by kind, whichever operation raises them. Each says in its fields what
 * it is about and in its `message` what happened, so a protocol or client handles a kind once,
 * however many operations report it, and a new operation adds no mapping: `NotFound`, for anything
 * the caller named that is missing or out of their reach; `Changed`, for what changed since the
 * caller read it; and `Denied`, for who may not do what they asked, whose `reason` says why, as
 * `HumanRequired` or `NotGranted`, so a caller recovers from one reason with
 * `Effect.catchReason("CoreError.Denied", "NotGranted", ...)`.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Requirement from "../authorization/Requirement.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
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
