import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends/core/thread";
import {
  AssignmentService,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends/core/authorization";
import { Commit } from "@amends/core/journal";
import { ChangeFeed } from "@amends/core/change-feed";
import { NotificationService } from "@amends/core/notification";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends/core/group";
import {
  InvitationService,
  MemberService,
  OwnershipService,
  Workspace,
  WorkspaceSettingsService,
} from "@amends/core/workspace";
import { ReadStateService } from "@amends/core/read-state";
import { ConnectionV2Service } from "@amends/core/connection-v2";
import { AgentV2Service } from "@amends/core/agent-v2";
import { Turn, TurnService } from "@amends/core/turn";
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
  WorkspaceSettingsService.Changed,
  ChangeFeed.Unavailable,
  Turn.LogUnavailable,
  NotMember,
  WorkspaceNotFound,
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
  AssignmentService.NotFound,
  AssignmentService.MemberNotFound,
  AssignmentService.InactiveMember,
  AssignmentService.Changed,
  OwnershipService.NotOwner,
  OwnershipService.MemberNotFound,
  OwnershipService.InvalidRecipient,
  OwnershipService.Changed,
  MemberService.NotFound,
  MemberService.OwnerProtected,
  MemberService.AlreadyRemoved,
  NotificationService.NotFound,
  NotificationService.HumanRecipientRequired,
  NotificationService.AlreadyHandled,
  ThreadService.GroupNotFound,
  ThreadService.NotFound,
  ThreadService.ParticipantUnavailable,
  ThreadService.HumanAuthorRequired,
  ThreadService.DirectMembersRequired,
  ThreadMessageService.NotFound,
  ThreadMessageService.ParticipantUnavailable,
  ThreadMessageService.HumanAuthorRequired,
  ThreadParticipationService.ThreadNotFound,
  ThreadParticipationService.NotFound,
  ThreadParticipationService.AlreadyEnded,
  ThreadParticipationService.FixedParticipation,
  GroupService.MemberNotFound,
  GroupService.NotFound,
  GroupService.InactiveMember,
  GroupService.NotRenamable,
  GroupService.Changed,
  GroupMembershipService.GroupNotFound,
  GroupMembershipService.MemberNotFound,
  GroupMembershipService.InactiveMember,
  GroupMembershipService.AlreadyMember,
  GroupMembershipService.NotFound,
  GroupMembershipService.AlreadyRemoved,
  GroupMembershipService.FixedMembership,
  GroupMembershipService.GeneralMembership,
  GroupFollowService.GroupNotFound,
  GroupFollowService.NotFollowable,
  GroupFollowService.MemberUnavailable,
  GroupFollowService.AgentRequired,
  ReadStateService.HumanRequired,
  ReadStateService.ThreadNotFound,
  ReadStateService.GroupNotFound,
  ReadStateService.BeyondTimeline,
  InvitationService.NotFound,
  InvitationService.NotRecipient,
  InvitationService.AlreadyMember,
  InvitationService.Unavailable,
  InvitationService.InvalidExpiry,
  ConnectionV2Service.NotFound,
  ConnectionV2Service.Changed,
  ConnectionV2Service.UnknownIntegration,
  ConnectionV2Service.InvalidConnection,
  ConnectionV2Service.Keyless,
  ConnectionV2Service.CredentialsUnavailable,
  AgentV2Service.NotFound,
  AgentV2Service.Changed,
  AgentV2Service.ConnectionUnavailable,
  AgentV2Service.Incomplete,
  TurnService.NotFound,
  TurnService.NotActive,
  TurnService.NotRetryable,
]);
export type PublicError = typeof PublicError.Type;

/** The public outcomes of a core program whose error type is E. */
export type PublicErrorOf<E> = Extract<E, PublicError> | Conflict | Uncertain | InvalidInput;

export * as GatewayErrors from "./errors.ts";
