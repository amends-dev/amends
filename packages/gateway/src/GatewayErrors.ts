/**
 * The outcomes a program run through the gateway may fail with: core's outcomes by kind, such as
 * `CoreError.NotFound`, and the domain errors its services still declare, which pass through
 * unchanged, and the gateway's own, such as `Uncertain`. Every other failure becomes a defect.
 * `PublicError` lists them all, so a service error core adds reaches callers only once it is
 * listed here. The HTTP contract imports this module from `@amends-dev/gateway/GatewayErrors`,
 * which does not load the gateway itself.
 *
 * @since 0.1.0
 */
import { ThreadService, ThreadParticipationService } from "@amends-dev/core/thread";
import { Delegation } from "@amends-dev/core/authorization";
import { Commit } from "@amends-dev/core/journal";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import { InvitationService, Workspace } from "@amends-dev/core/workspace";
import { ConnectionService } from "@amends-dev/core/connection";
import { AgentService } from "@amends-dev/core/agent";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { Schema } from "effect";
import { CoreError } from "@amends-dev/core/error";

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
  CoreError.Denied,
  CoreError.Conflict,
  CoreError.Unavailable,
  Uncertain,
  InvalidInput,
  Delegation.UnsupportedRole,
  ThreadService.DirectMembersRequired,
  ThreadParticipationService.FixedParticipation,
  GroupService.NotRenamable,
  GroupMembershipService.FixedMembership,
  GroupMembershipService.GeneralMembership,
  GroupFollowService.NotFollowable,
  InvitationService.InvalidExpiry,
  ConnectionService.UnknownIntegration,
  ConnectionService.InvalidConnection,
  ConnectionService.Keyless,
  AgentService.ConnectionUnavailable,
  AgentService.Incomplete,
  ChannelService.ConnectionUnavailable,
  ChannelIntake.Rejected,
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
export type PublicErrorOf<E> =
  | Extract<E, PublicError>
  | CoreError.Unavailable
  | Uncertain
  | InvalidInput;
