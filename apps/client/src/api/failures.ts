import { Cause, Effect, Schema } from "effect";
import type { ApiClient } from "./client.ts";

/**
 * Why a workspace operation failed, for the reader. `changed`, `denied`, and `gone` mean what the
 * reader sees is out of date; `invalid` and `failed` leave it current, so they may retry at once.
 */
export type WorkspaceFailure = "changed" | "denied" | "gone" | "invalid" | "failed";
/** Whether a failure means the values on screen are out of date, so edits wait for a refresh. */
export const isStale = (failure: WorkspaceFailure) =>
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
  | Failure<Client["environments"][keyof Client["environments"]]>
  | Failure<Client["agents"][keyof Client["agents"]]>
  | Failure<Client["turns"][keyof Client["turns"]]>
  | InvalidCommand;
// Keyed by every reported tag, so a new or renamed failure fails to compile until it is placed.
const failures: { readonly [Tag in Reported["_tag"]]: WorkspaceFailure } = {
  "WorkspaceSettings.Changed": "changed",
  "AssignmentApplication.Changed": "changed",
  "OwnershipApplication.Changed": "changed",
  "Gateway.Conflict": "changed",
  "Authorization.Denied": "denied",
  "Authorization.InvalidActor": "denied",
  "Delegation.Denied": "denied",
  "Delegation.OwnerProtected": "denied",
  "Gateway.NotMember": "denied",
  "MemberApplication.OwnerProtected": "denied",
  "OwnershipApplication.NotOwner": "denied",
  "InvitationApplication.NotRecipient": "denied",
  "Api.HumanRequired": "denied",
  "AssignmentApplication.NotFound": "gone",
  "AssignmentApplication.MemberNotFound": "gone",
  "AssignmentApplication.InactiveMember": "gone",
  "Delegation.RoleNotFound": "gone",
  "Gateway.WorkspaceNotFound": "gone",
  "InvitationApplication.AlreadyMember": "gone",
  "InvitationApplication.NotFound": "gone",
  "InvitationApplication.Unavailable": "gone",
  "MemberApplication.AlreadyRemoved": "gone",
  "MemberApplication.NotFound": "gone",
  "OwnershipApplication.InvalidRecipient": "gone",
  "OwnershipApplication.MemberNotFound": "gone",
  // Conversations: someone else changed what the reader acted on, or it left their reach.
  "GroupMembershipApplication.AlreadyMember": "changed",
  "GroupApplication.Changed": "changed",
  "ReadStateApplication.BeyondTimeline": "changed",
  "ThreadParticipationApplication.AlreadyEnded": "changed",
  "NotificationApplication.AlreadyHandled": "changed",
  // Connections: renamed meanwhile, or the provider it names was removed from this host.
  "ConnectionApplication.Changed": "changed",
  "ConnectionApplication.UnknownImplementation": "changed",
  "ConnectionApplication.NotFound": "gone",
  "ConnectionApplication.InvalidSettings": "invalid",
  "ConnectionApplication.UnsupportedAuthentication": "invalid",
  // Environments: renamed meanwhile, or naming a harness or provider this host no longer has;
  // `environmentProblems` tells the refusals apart.
  "EnvironmentApplication.Changed": "changed",
  "EnvironmentApplication.UnknownHarness": "changed",
  "EnvironmentApplication.UnknownSandboxProvider": "changed",
  "EnvironmentApplication.NotFound": "gone",
  "EnvironmentApplication.UnsupportedPlacement": "invalid",
  "EnvironmentApplication.InvalidSandbox": "invalid",
  // Agents: renamed meanwhile, or gone; a connection or environment no longer usable, or one
  // that cannot run the model, is refused with the draft kept, and `agentProblems` names it.
  "AgentApplication.Changed": "changed",
  "AgentApplication.NotFound": "gone",
  "AgentApplication.ConnectionUnavailable": "invalid",
  "AgentApplication.EnvironmentUnavailable": "invalid",
  "AgentApplication.Incompatible": "invalid",
  // Turns: one that finished or moved on meanwhile, or that left the reader's reach;
  // `turnProblems` tells the refusals apart.
  "TurnApplication.NotActive": "changed",
  "TurnApplication.NotRetryable": "changed",
  "TurnApplication.NotFound": "gone",
  "TurnApplication.ThreadNotFound": "gone",
  // Following a turn's log stopped short, or too many streams are open: following again may work.
  "Turn.LogUnavailable": "failed",
  "Api.TooManyStreams": "failed",
  // The host keeps no credentials; `credentialsUnavailable` tells it apart from other failures.
  "ConnectionApplication.CredentialsUnavailable": "failed",
  "GroupFollowApplication.AgentRequired": "denied",
  "ReadStateApplication.HumanRequired": "denied",
  "ThreadApplication.HumanAuthorRequired": "denied",
  "ThreadMessageApplication.HumanAuthorRequired": "denied",
  "NotificationApplication.HumanRecipientRequired": "denied",
  "GroupApplication.NotFound": "gone",
  "GroupApplication.NotRenamable": "invalid",
  "GroupApplication.MemberNotFound": "gone",
  "GroupApplication.InactiveMember": "gone",
  "GroupMembershipApplication.GroupNotFound": "gone",
  "GroupMembershipApplication.MemberNotFound": "gone",
  "GroupMembershipApplication.NotFound": "gone",
  "GroupMembershipApplication.InactiveMember": "gone",
  "GroupMembershipApplication.AlreadyRemoved": "gone",
  "GroupFollowApplication.GroupNotFound": "gone",
  "GroupFollowApplication.MemberUnavailable": "gone",
  "ReadStateApplication.ThreadNotFound": "gone",
  "ReadStateApplication.GroupNotFound": "gone",
  "ThreadApplication.NotFound": "gone",
  "ThreadApplication.GroupNotFound": "gone",
  "ThreadApplication.ParticipantUnavailable": "gone",
  "ThreadMessageApplication.NotFound": "gone",
  "ThreadMessageApplication.ParticipantUnavailable": "gone",
  "ThreadParticipationApplication.ThreadNotFound": "gone",
  "ThreadParticipationApplication.NotFound": "gone",
  "NotificationApplication.NotFound": "gone",
  "NotificationApplication.SourceUnavailable": "gone",
  "Client.InvalidCommand": "invalid",
  "GroupMembershipApplication.FixedMembership": "invalid",
  "GroupMembershipApplication.GeneralMembership": "invalid",
  "ThreadParticipationApplication.FixedParticipation": "invalid",
  "GroupFollowApplication.NotFollowable": "invalid",
  "ThreadApplication.DirectMembersRequired": "invalid",
  "Gateway.InvalidInput": "invalid",
  "InvitationApplication.InvalidExpiry": "invalid",
  "Delegation.UnsupportedRole": "invalid",
  "PermissionCatalog.Unknown": "invalid",
  // Rejected credentials sign out in the HTTP layer; the rest are transport or host failures.
  "Api.Unauthorized": "failed",
  "Gateway.Uncertain": "failed",
  HttpClientError: "failed",
  // A response that fails its schema; readers' inputs fail as Client.InvalidCommand instead.
  SchemaError: "failed",
};
const isFailure = (error: unknown): error is { readonly _tag: keyof typeof failures } =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  Object.hasOwn(failures, error._tag as string);
/** Classify an operation's cause; transport failures, malformed responses, and defects fail. */
export const workspaceFailure = (cause: Cause.Cause<unknown>): WorkspaceFailure => {
  for (const reason of cause.reasons)
    if (Cause.isFailReason(reason) && isFailure(reason.error)) return failures[reason.error._tag];
  return "failed";
};
