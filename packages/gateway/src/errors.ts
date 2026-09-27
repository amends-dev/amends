import {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import {
  AssignmentApplication,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends/core/authorization";
import { Commit } from "@amends/core/journal";
import { ChangeFeed } from "@amends/core/change-feed";
import { NotificationApplication } from "@amends/core/notification";
import {
  GroupApplication,
  GroupFollowApplication,
  GroupMembershipApplication,
} from "@amends/core/group";
import {
  InvitationApplication,
  MemberApplication,
  OwnershipApplication,
  Workspace,
  WorkspaceSettingsApplication,
} from "@amends/core/workspace";
import { ReadStateApplication } from "@amends/core/attention";
import { SignalApplication } from "@amends/core/signal";
import { Request } from "@amends/core/request";
import { Schema } from "effect";

export class NotMember extends Schema.TaggedError<NotMember>()("Gateway.NotMember", {
  workspaceId: Workspace.Id,
}) {}

/** No workspace was ever created under this ID. */
export class WorkspaceNotFound extends Schema.TaggedError<WorkspaceNotFound>()(
  "Gateway.WorkspaceNotFound",
  { workspaceId: Workspace.Id },
) {}

/** Storage contention; the operation did not apply and may be retried. */
export class Conflict extends Schema.TaggedError<Conflict>()("Gateway.Conflict", {
  workspaceId: Workspace.Id,
  operation: Schema.String,
  message: Schema.String,
}) {}

/** The commit's outcome is unknown; reconcile stored state before repeating. */
export class Uncertain extends Schema.TaggedError<Uncertain>()("Gateway.Uncertain", {
  workspaceId: Workspace.Id,
  commitId: Commit.Id,
}) {}

/** Core rejected the operation's input, such as invitation grants for the wrong workspace or target kind. */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("Gateway.InvalidInput", {
  message: Schema.String,
}) {}

/**
 * Domain outcomes a caller can act on. Storage, transaction, projection, and
 * consistency failures reveal nothing actionable and become defects that keep
 * their original cause for host logging.
 */
export const PublicError = Schema.Union([
  WorkspaceSettingsApplication.Changed,
  ChangeFeed.Unavailable,
  NotMember,
  WorkspaceNotFound,
  Request.Reused,
  Conflict,
  Uncertain,
  InvalidInput,
  Authorization.Denied,
  Authorization.InvalidActor,
  PermissionCatalog.Unknown,
  Delegation.Denied,
  Delegation.OwnerProtected,
  Delegation.UnsupportedRole,
  Delegation.RoleNotFound,
  AssignmentApplication.NotFound,
  AssignmentApplication.MemberNotFound,
  AssignmentApplication.InactiveMember,
  AssignmentApplication.Changed,
  OwnershipApplication.NotOwner,
  OwnershipApplication.MemberNotFound,
  OwnershipApplication.InvalidRecipient,
  OwnershipApplication.Changed,
  MemberApplication.NotFound,
  MemberApplication.OwnerProtected,
  MemberApplication.AlreadyRemoved,
  NotificationApplication.NotFound,
  NotificationApplication.SourceUnavailable,
  NotificationApplication.HumanRecipientRequired,
  NotificationApplication.AlreadyHandled,
  SignalApplication.ThreadNotFound,
  ThreadApplication.GroupNotFound,
  ThreadApplication.NotFound,
  ThreadApplication.ParticipantUnavailable,
  ThreadApplication.HumanAuthorRequired,
  ThreadApplication.DirectMembersRequired,
  ThreadMessageApplication.NotFound,
  ThreadMessageApplication.ParticipantUnavailable,
  ThreadMessageApplication.HumanAuthorRequired,
  ThreadParticipationApplication.ThreadNotFound,
  ThreadParticipationApplication.NotFound,
  ThreadParticipationApplication.AlreadyEnded,
  ThreadParticipationApplication.FixedParticipation,
  GroupApplication.MemberNotFound,
  GroupApplication.NotFound,
  GroupApplication.InactiveMember,
  GroupApplication.NotRenamable,
  GroupApplication.Changed,
  GroupMembershipApplication.GroupNotFound,
  GroupMembershipApplication.MemberNotFound,
  GroupMembershipApplication.InactiveMember,
  GroupMembershipApplication.AlreadyMember,
  GroupMembershipApplication.NotFound,
  GroupMembershipApplication.AlreadyRemoved,
  GroupMembershipApplication.FixedMembership,
  GroupMembershipApplication.GeneralMembership,
  GroupFollowApplication.GroupNotFound,
  GroupFollowApplication.NotFollowable,
  GroupFollowApplication.MemberUnavailable,
  GroupFollowApplication.AgentRequired,
  ReadStateApplication.HumanRequired,
  ReadStateApplication.ThreadNotFound,
  ReadStateApplication.GroupNotFound,
  ReadStateApplication.BeyondTimeline,
  InvitationApplication.NotFound,
  InvitationApplication.NotRecipient,
  InvitationApplication.AlreadyMember,
  InvitationApplication.Unavailable,
  InvitationApplication.InvalidExpiry,
]);
export type PublicError = typeof PublicError.Type;

/** The public outcomes of a core program whose error type is E. */
export type ExposedError<E> = Extract<E, PublicError> | Conflict | Uncertain | InvalidInput;

export * as GatewayErrors from "./errors.ts";
