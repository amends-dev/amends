/**
 * The outcomes a program run through the gateway may fail with: core's domain errors, which pass
 * through unchanged, and the gateway's own, such as `NotMember`. Every other failure becomes a
 * defect. `PublicError` lists them all, so an error core adds reaches callers only once it is
 * listed here. The HTTP contract imports this module from `@amends-dev/gateway/GatewayErrors`,
 * which does not load the gateway itself.
 *
 * @since 0.1.0
 */
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import {
  AssignmentService,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends-dev/core/authorization";
import { Commit } from "@amends-dev/core/journal";
import { ChangeFeed } from "@amends-dev/core/change-feed";
import { NotificationService } from "@amends-dev/core/notification";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import {
  InvitationService,
  MemberService,
  OwnershipService,
  Workspace,
  WorkspaceSettingsService,
} from "@amends-dev/core/workspace";
import { ReadStateService } from "@amends-dev/core/read-state";
import { ConnectionService } from "@amends-dev/core/connection";
import { AgentService } from "@amends-dev/core/agent";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { TaskService } from "@amends-dev/core/task";
import { Turn, TurnService } from "@amends-dev/core/turn";
import { Schema } from "effect";

/**
 * The identity has no active membership of the workspace. `asMember` answers the same for a
 * workspace that does not exist, without loading it.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotMember extends Schema.TaggedError<NotMember>()("Gateway.NotMember", {
  workspaceId: Workspace.Id,
}) {}

/**
 * No workspace was ever created under this ID.
 *
 * @category errors
 * @since 0.1.0
 */
export class WorkspaceNotFound extends Schema.TaggedError<WorkspaceNotFound>()(
  "Gateway.WorkspaceNotFound",
  { workspaceId: Workspace.Id },
) {}

/**
 * Storage contention; the operation did not apply and may be retried.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("Gateway.Conflict", {
  workspaceId: Workspace.Id,
  operation: Schema.String,
  message: Schema.String,
}) {}

/**
 * The commit's outcome is unknown; reconcile stored state before repeating.
 *
 * @category errors
 * @since 0.1.0
 */
export class Uncertain extends Schema.TaggedError<Uncertain>()("Gateway.Uncertain", {
  workspaceId: Workspace.Id,
  commitId: Commit.Id,
}) {}

/**
 * Core rejected the operation's input, such as invitation grants for the wrong workspace or target
 * kind.
 *
 * @category errors
 * @since 0.1.0
 */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("Gateway.InvalidInput", {
  message: Schema.String,
}) {}

/**
 * Domain outcomes a caller can act on. Storage, transaction, projection, and
 * consistency failures reveal nothing actionable and become defects that keep
 * their original cause for host logging.
 *
 * @category schemas
 * @since 0.1.0
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
  ThreadService.Changed,
  ThreadMessageService.NotFound,
  ThreadMessageService.ParticipantUnavailable,
  ThreadMessageService.HumanAuthorRequired,
  ThreadMessageService.MessageNotFound,
  ThreadMessageService.NotAuthor,
  ThreadMessageService.Deleted,
  ThreadMessageService.Changed,
  ThreadParticipationService.ThreadNotFound,
  ThreadParticipationService.NotFound,
  ThreadParticipationService.AlreadyEnded,
  ThreadParticipationService.FixedParticipation,
  TaskService.NotFound,
  TaskService.AlreadyTask,
  TaskService.Changed,
  TaskService.ParticipantUnavailable,
  TaskService.GroupNotFound,
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
  ConnectionService.NotFound,
  ConnectionService.Changed,
  ConnectionService.UnknownIntegration,
  ConnectionService.InvalidConnection,
  ConnectionService.Keyless,
  ConnectionService.CredentialsUnavailable,
  AgentService.NotFound,
  AgentService.Changed,
  AgentService.ConnectionUnavailable,
  AgentService.Incomplete,
  TurnService.NotFound,
  TurnService.NotActive,
  TurnService.NotRetryable,
  ChannelService.NotFound,
  ChannelService.GroupNotFound,
  ChannelService.ConnectionUnavailable,
  ChannelService.NotBound,
  ChannelIntake.Rejected,
  ChannelIntake.Unavailable,
]);
/**
 * @category schemas
 * @since 0.1.0
 */
export type PublicError = typeof PublicError.Type;

/**
 * The public outcomes of a core program whose error type is `E`: the public errors among `E`,
 * and the storage outcomes and invalid input the gateway adds to every program.
 *
 * @category models
 * @since 0.1.0
 */
export type PublicErrorOf<E> = Extract<E, PublicError> | Conflict | Uncertain | InvalidInput;
