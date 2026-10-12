import { Cause, Effect, Record, Schema } from "effect";
import type { ApiClient } from "./client.ts";

/**
 * Why a workspace operation failed, for the reader. `changed`, `denied`, and `gone` mean what the
 * reader sees is out of date; `invalid` and `failed` leave it current, so they may retry at once.
 */
export type WorkspaceFailure = "changed" | "denied" | "gone" | "invalid" | "failed";
/** Whether a failure means the values on screen are out of date, so edits wait for a refresh. */
export const isStale = (failure: string) =>
  failure === "changed" || failure === "denied" || failure === "gone";

/** A command the reader composed that fails the contract's schema before any request. */
export class InvalidCommand extends Schema.TaggedError<InvalidCommand>()("Client.InvalidCommand", {
  message: Schema.String,
}) {}
/** Decode a reader's input for a request, reporting a mismatch as an invalid command. */
export const command = <S extends Schema.Top>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema);
  return (input: unknown) =>
    decode(input).pipe(Effect.mapError((error) => new InvalidCommand({ message: error.message })));
};

type Client = ApiClient["Service"];
type Failure<F> = F extends (...args: never) => Effect.Effect<unknown, infer E, unknown>
  ? E
  : never;
/**
 * Every failure the workspace, member, access, invitation, conversation, connection, agent, turn,
 * and channel endpoints report.
 */
type Reported =
  | Failure<Client["workspaces"][keyof Client["workspaces"]]>
  | Failure<Client["members"][keyof Client["members"]]>
  | Failure<Client["assignments"][keyof Client["assignments"]]>
  | Failure<Client["invitations"][keyof Client["invitations"]]>
  | Failure<Client["groups"][keyof Client["groups"]]>
  | Failure<Client["threads"][keyof Client["threads"]]>
  | Failure<Client["tasks"][keyof Client["tasks"]]>
  | Failure<Client["notifications"][keyof Client["notifications"]]>
  | Failure<Client["connections"][keyof Client["connections"]]>
  | Failure<Client["agents"][keyof Client["agents"]]>
  | Failure<Client["turns"][keyof Client["turns"]]>
  | Failure<Client["channels"][keyof Client["channels"]]>
  | InvalidCommand;
// Keyed by every reported tag, so a new or renamed failure fails to compile until it is placed.
const failures: { readonly [Tag in Reported["_tag"]]: WorkspaceFailure } = {
  "WorkspaceSettingsService.Changed": "changed",
  "AssignmentService.Changed": "changed",
  "OwnershipService.Changed": "changed",
  "GatewayErrors.Conflict": "changed",
  "Authorization.Denied": "denied",
  "Authorization.InvalidActor": "denied",
  "Delegation.Denied": "denied",
  "Delegation.OwnerProtected": "denied",
  "GatewayErrors.NotMember": "denied",
  "MemberService.OwnerProtected": "denied",
  "OwnershipService.NotOwner": "denied",
  "InvitationService.NotRecipient": "denied",
  "ApiErrors.HumanRequired": "denied",
  "AssignmentService.NotFound": "gone",
  "AssignmentService.MemberNotFound": "gone",
  "AssignmentService.InactiveMember": "gone",
  "Delegation.RoleNotFound": "gone",
  "GatewayErrors.WorkspaceNotFound": "gone",
  "InvitationService.AlreadyMember": "gone",
  "InvitationService.NotFound": "gone",
  "InvitationService.Unavailable": "gone",
  "MemberService.AlreadyRemoved": "gone",
  "MemberService.NotFound": "gone",
  "OwnershipService.InvalidRecipient": "gone",
  "OwnershipService.MemberNotFound": "gone",
  // Conversations: someone else changed what the reader acted on, or it left their reach.
  "GroupMembershipService.AlreadyMember": "changed",
  "GroupService.Changed": "changed",
  "ReadStateService.BeyondTimeline": "changed",
  "ThreadParticipationService.AlreadyEnded": "changed",
  "NotificationService.AlreadyHandled": "changed",
  // Connections: renamed meanwhile, or naming an integration this host no longer has;
  // `connectionsFailure` tells the integration's refusals apart.
  "ConnectionService.Changed": "changed",
  "ConnectionService.UnknownIntegration": "changed",
  "ConnectionService.NotFound": "gone",
  "ConnectionService.InvalidConnection": "invalid",
  "ConnectionService.Keyless": "invalid",
  // Agents: renamed meanwhile, or gone; a connection no longer usable, or a setup that cannot
  // run, is refused with the draft kept, and `agentsFailure` tells them apart.
  "AgentService.Changed": "changed",
  "AgentService.NotFound": "gone",
  "AgentService.ConnectionUnavailable": "invalid",
  "AgentService.Incomplete": "invalid",
  // Turns: one that finished or moved on meanwhile, or that left the reader's reach;
  // `turnProblems` tells the refusals apart.
  "TurnService.NotActive": "changed",
  "TurnService.NotRetryable": "changed",
  "TurnService.NotFound": "gone",
  // Channels: one gone or out of reach, a group the reader left, a thread bound to no conversation;
  // a connection that gives no channels, or the reader may not use, is refused with the draft kept.
  "ChannelService.NotFound": "gone",
  "ChannelService.GroupNotFound": "gone",
  "ChannelService.NotBound": "gone",
  "ChannelService.ConnectionUnavailable": "invalid",
  // Following a turn's log stopped short, or too many streams are open: following again may work.
  "Turn.LogUnavailable": "failed",
  "ApiErrors.TooManyStreams": "failed",
  // The host keeps no credentials; `credentialsUnavailable` tells it apart from other failures.
  "ConnectionService.CredentialsUnavailable": "failed",
  "GroupFollowService.AgentRequired": "denied",
  "ReadStateService.HumanRequired": "denied",
  "ThreadService.HumanAuthorRequired": "denied",
  "ThreadMessageService.HumanAuthorRequired": "denied",
  "NotificationService.HumanRecipientRequired": "denied",
  "GroupService.NotFound": "gone",
  "GroupService.NotRenamable": "invalid",
  "GroupService.MemberNotFound": "gone",
  "GroupService.InactiveMember": "gone",
  "GroupMembershipService.GroupNotFound": "gone",
  "GroupMembershipService.MemberNotFound": "gone",
  "GroupMembershipService.NotFound": "gone",
  "GroupMembershipService.InactiveMember": "gone",
  "GroupMembershipService.AlreadyRemoved": "gone",
  "GroupFollowService.GroupNotFound": "gone",
  "GroupFollowService.MemberUnavailable": "gone",
  "ReadStateService.ThreadNotFound": "gone",
  "ReadStateService.GroupNotFound": "gone",
  "ThreadService.NotFound": "gone",
  "ThreadService.GroupNotFound": "gone",
  "ThreadService.ParticipantUnavailable": "gone",
  "ThreadMessageService.NotFound": "gone",
  "ThreadMessageService.ParticipantUnavailable": "gone",
  "ThreadMessageService.MessageNotFound": "gone",
  "ThreadMessageService.NotAuthor": "denied",
  "ThreadMessageService.Deleted": "gone",
  "ThreadMessageService.Changed": "changed",
  "TaskService.NotFound": "gone",
  "TaskService.GroupNotFound": "gone",
  "TaskService.ParticipantUnavailable": "gone",
  "TaskService.AlreadyTask": "changed",
  "TaskService.Changed": "changed",
  "ThreadParticipationService.ThreadNotFound": "gone",
  "ThreadParticipationService.NotFound": "gone",
  "NotificationService.NotFound": "gone",
  "Client.InvalidCommand": "invalid",
  "GroupMembershipService.FixedMembership": "invalid",
  "GroupMembershipService.GeneralMembership": "invalid",
  "ThreadParticipationService.FixedParticipation": "invalid",
  "GroupFollowService.NotFollowable": "invalid",
  "ThreadService.DirectMembersRequired": "invalid",
  "ThreadService.Changed": "changed",
  "GatewayErrors.InvalidInput": "invalid",
  "InvitationService.InvalidExpiry": "invalid",
  "Delegation.UnsupportedRole": "invalid",
  // Rejected credentials sign out in the HTTP layer; the rest are transport or host failures.
  "Authentication.Unauthorized": "failed",
  "GatewayErrors.Uncertain": "failed",
  HttpClientError: "failed",
  // A response that fails its schema; readers' inputs fail as Client.InvalidCommand instead.
  SchemaError: "failed",
};
const hasKnownFailureTag = Schema.is(
  Schema.Struct({ _tag: Schema.Literals(Record.keys(failures)) }),
);
/**
 * Classify the first failure with a recognized tag, including tags mapped to `failed`.
 * Unknown failures, defects, and interruptions are skipped; no recognized failure means `failed`.
 */
export const workspaceFailure = (cause: Cause.Cause<unknown>): WorkspaceFailure => {
  for (const reason of cause.reasons)
    if (Cause.isFailReason(reason) && hasKnownFailureTag(reason.error))
      return failures[reason.error._tag];
  return "failed";
};
