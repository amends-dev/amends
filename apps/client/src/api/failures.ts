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
 * Every failure the workspace, member, access, invitation, conversation, connection,
 * environment, agent, and turn endpoints report.
 */
type Reported =
  | Failure<Client["workspaces"][keyof Client["workspaces"]]>
  | Failure<Client["members"][keyof Client["members"]]>
  | Failure<Client["assignments"][keyof Client["assignments"]]>
  | Failure<Client["invitations"][keyof Client["invitations"]]>
  | Failure<Client["groups"][keyof Client["groups"]]>
  | Failure<Client["threads"][keyof Client["threads"]]>
  | Failure<Client["notifications"][keyof Client["notifications"]]>
  | Failure<Client["connections"][keyof Client["connections"]]>
  | Failure<Client["connectionsV2"][keyof Client["connectionsV2"]]>
  | Failure<Client["environments"][keyof Client["environments"]]>
  | Failure<Client["agents"][keyof Client["agents"]]>
  | Failure<Client["agentsV2"][keyof Client["agentsV2"]]>
  | Failure<Client["turns"][keyof Client["turns"]]>
  | InvalidCommand;
// Keyed by every reported tag, so a new or renamed failure fails to compile until it is placed.
const failures: { readonly [Tag in Reported["_tag"]]: WorkspaceFailure } = {
  "WorkspaceSettings.Changed": "changed",
  "AssignmentService.Changed": "changed",
  "OwnershipService.Changed": "changed",
  "Gateway.Conflict": "changed",
  "Authorization.Denied": "denied",
  "Authorization.InvalidActor": "denied",
  "Delegation.Denied": "denied",
  "Delegation.OwnerProtected": "denied",
  "Gateway.NotMember": "denied",
  "MemberService.OwnerProtected": "denied",
  "OwnershipService.NotOwner": "denied",
  "InvitationService.NotRecipient": "denied",
  "Api.HumanRequired": "denied",
  "AssignmentService.NotFound": "gone",
  "AssignmentService.MemberNotFound": "gone",
  "AssignmentService.InactiveMember": "gone",
  "Delegation.RoleNotFound": "gone",
  "Gateway.WorkspaceNotFound": "gone",
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
  // Connections: renamed meanwhile, or the provider it names was removed from this host.
  "ConnectionService.Changed": "changed",
  "ConnectionService.UnknownImplementation": "changed",
  "ConnectionService.NotFound": "gone",
  "ConnectionService.InvalidSettings": "invalid",
  "ConnectionService.UnsupportedAuthentication": "invalid",
  // Connections v2 the same way; `connectionsV2Failure` tells the integration's refusals apart.
  "ConnectionV2Service.Changed": "changed",
  "ConnectionV2Service.UnknownIntegration": "changed",
  "ConnectionV2Service.NotFound": "gone",
  "ConnectionV2Service.InvalidConnection": "invalid",
  "ConnectionV2Service.Keyless": "invalid",
  // Environments: renamed meanwhile, or naming a harness or provider this host no longer has;
  // `environmentProblems` tells the refusals apart.
  "EnvironmentService.Changed": "changed",
  "EnvironmentService.UnknownHarness": "changed",
  "EnvironmentService.UnknownSandboxProvider": "changed",
  "EnvironmentService.NotFound": "gone",
  "EnvironmentService.UnsupportedPlacement": "invalid",
  "EnvironmentService.InvalidSandbox": "invalid",
  // Agents: renamed meanwhile, or gone; a connection or environment no longer usable, or one
  // that cannot run the model, is refused with the draft kept, and `agentProblems` names it.
  "AgentService.Changed": "changed",
  "AgentService.NotFound": "gone",
  "AgentService.ConnectionUnavailable": "invalid",
  "AgentService.EnvironmentUnavailable": "invalid",
  "AgentService.Incompatible": "invalid",
  // Agents v2 the same way; `agentsV2Failure` tells a refused setup apart.
  "AgentV2Service.Changed": "changed",
  "AgentV2Service.NotFound": "gone",
  "AgentV2Service.ConnectionUnavailable": "invalid",
  "AgentV2Service.Incomplete": "invalid",
  // Turns: one that finished or moved on meanwhile, or that left the reader's reach;
  // `turnProblems` tells the refusals apart.
  "TurnService.NotActive": "changed",
  "TurnService.NotRetryable": "changed",
  "TurnService.NotFound": "gone",
  // Following a turn's log stopped short, or too many streams are open: following again may work.
  "Turn.LogUnavailable": "failed",
  "Api.TooManyStreams": "failed",
  // The host keeps no credentials; `credentialsUnavailable` tells it apart from other failures.
  "ConnectionService.CredentialsUnavailable": "failed",
  "ConnectionV2Service.CredentialsUnavailable": "failed",
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
  "ThreadParticipationService.ThreadNotFound": "gone",
  "ThreadParticipationService.NotFound": "gone",
  "NotificationService.NotFound": "gone",
  "Client.InvalidCommand": "invalid",
  "GroupMembershipService.FixedMembership": "invalid",
  "GroupMembershipService.GeneralMembership": "invalid",
  "ThreadParticipationService.FixedParticipation": "invalid",
  "GroupFollowService.NotFollowable": "invalid",
  "ThreadService.DirectMembersRequired": "invalid",
  "Gateway.InvalidInput": "invalid",
  "InvitationService.InvalidExpiry": "invalid",
  "Delegation.UnsupportedRole": "invalid",
  "PermissionCatalog.Unknown": "invalid",
  // Rejected credentials sign out in the HTTP layer; the rest are transport or host failures.
  "Api.Unauthorized": "failed",
  "Gateway.Uncertain": "failed",
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
