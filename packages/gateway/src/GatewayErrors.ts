/**
 * The outcomes a program run through the gateway may fail with: core's outcomes by kind, such as
 * `CoreError.NotFound`, and the domain errors its services still declare, which pass through
 * unchanged, and the gateway's own, such as `NotMember`. Every other failure becomes a defect.
 * `PublicError` lists them all, so a service error core adds reaches callers only once it is
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
import { AssignmentService, Authorization, Delegation } from "@amends-dev/core/authorization";
import { Commit } from "@amends-dev/core/journal";
import { ChangeFeed } from "@amends-dev/core/change-feed";
import { NotificationService } from "@amends-dev/core/notification";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import {
  InvitationService,
  MemberService,
  OwnershipService,
  Workspace,
} from "@amends-dev/core/workspace";
import { ReadStateService } from "@amends-dev/core/read-state";
import { ConnectionService } from "@amends-dev/core/connection";
import { AgentService } from "@amends-dev/core/agent";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { TaskService } from "@amends-dev/core/task";
import { Turn, TurnService } from "@amends-dev/core/turn";
import { Schema } from "effect";
import { CoreError } from "@amends-dev/core/error";

/**
 * The identity has no active membership of the workspace. `asMember` answers the same for a
 * workspace that does not exist, without loading it.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotMember extends Schema.TaggedError<NotMember>()("GatewayErrors.NotMember", {
  workspaceId: Workspace.Id,
}) {}

/**
 * Storage contention; the operation did not apply and may be retried.
 *
 * @category errors
 * @since 0.1.0
 */
export class Conflict extends Schema.TaggedError<Conflict>()("GatewayErrors.Conflict", {
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
export class Uncertain extends Schema.TaggedError<Uncertain>()("GatewayErrors.Uncertain", {
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
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("GatewayErrors.InvalidInput", {
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
  CoreError.NotFound,
  CoreError.Changed,
  ChangeFeed.Unavailable,
  Turn.LogUnavailable,
  NotMember,
  Conflict,
  Uncertain,
  InvalidInput,
  Authorization.Denied,
  Authorization.InvalidActor,
  Delegation.Denied,
  Delegation.OwnerProtected,
  Delegation.UnsupportedRole,
  AssignmentService.InactiveMember,
  OwnershipService.NotOwner,
  OwnershipService.InvalidRecipient,
  MemberService.OwnerProtected,
  MemberService.AlreadyRemoved,
  NotificationService.HumanRecipientRequired,
  NotificationService.AlreadyHandled,
  ThreadService.ParticipantUnavailable,
  ThreadService.HumanAuthorRequired,
  ThreadService.DirectMembersRequired,
  ThreadMessageService.ParticipantUnavailable,
  ThreadMessageService.HumanAuthorRequired,
  ThreadMessageService.NotAuthor,
  ThreadMessageService.Deleted,
  ThreadParticipationService.AlreadyEnded,
  ThreadParticipationService.FixedParticipation,
  TaskService.AlreadyTask,
  TaskService.ParticipantUnavailable,
  GroupService.InactiveMember,
  GroupService.NotRenamable,
  GroupMembershipService.InactiveMember,
  GroupMembershipService.AlreadyMember,
  GroupMembershipService.AlreadyRemoved,
  GroupMembershipService.FixedMembership,
  GroupMembershipService.GeneralMembership,
  GroupFollowService.NotFollowable,
  GroupFollowService.MemberUnavailable,
  GroupFollowService.AgentRequired,
  ReadStateService.HumanRequired,
  ReadStateService.BeyondTimeline,
  InvitationService.NotRecipient,
  InvitationService.AlreadyMember,
  InvitationService.Unavailable,
  InvitationService.InvalidExpiry,
  ConnectionService.UnknownIntegration,
  ConnectionService.InvalidConnection,
  ConnectionService.Keyless,
  ConnectionService.CredentialsUnavailable,
  AgentService.ConnectionUnavailable,
  AgentService.Incomplete,
  TurnService.NotActive,
  TurnService.NotRetryable,
  ChannelService.ConnectionUnavailable,
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
