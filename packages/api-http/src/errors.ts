import {
  AssignmentApplication,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends/core/authorization";
import {
  InvitationApplication,
  MemberApplication,
  OwnershipApplication,
  WorkspaceSettingsApplication,
} from "@amends/core/workspace";
import { GatewayErrors } from "@amends/gateway/errors";
import {
  GroupApplication,
  GroupFollowApplication,
  GroupMembershipApplication,
} from "@amends/core/group";
import { AgentApplication } from "@amends/core/agent";
import { ConnectionApplication } from "@amends/core/connection";
import { EnvironmentApplication } from "@amends/core/environment";
import { NotificationApplication } from "@amends/core/notification";
import { ReadStateApplication } from "@amends/core/attention";
import {
  ThreadApplication,
  ThreadMessageApplication,
  ThreadParticipationApplication,
} from "@amends/core/thread";
import { Request } from "@amends/core/request";
import { SignalApplication } from "@amends/core/signal";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

/** The principal is an agent where only a human may act. */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "Api.HumanRequired",
  {},
  { httpApiStatus: 403 },
) {}

/**
 * The caller cannot open another live-update stream on this server now: the workspace, or the
 * caller within it, already has as many as it may. Retry after closing one.
 */
export class TooManyStreams extends Schema.TaggedError<TooManyStreams>()(
  "Api.TooManyStreams",
  { limit: Schema.Literals(["workspace", "member"]) },
  { httpApiStatus: 429 },
) {}

/**
 * HTTP statuses for gateway and core outcomes. Core declares no transport
 * concerns, so the status lives on the contract's view of each error.
 */
export const NotMember = GatewayErrors.NotMember.pipe(HttpApiSchema.status(403));
export const WorkspaceChanged = WorkspaceSettingsApplication.Changed.pipe(
  HttpApiSchema.status(409),
);
export const WorkspaceNotFound = GatewayErrors.WorkspaceNotFound.pipe(HttpApiSchema.status(404));
/** The request key was already used for a different request. */
export const RequestReused = Request.Reused.pipe(HttpApiSchema.status(422));
/**
 * The request key a creating endpoint accepts: send a new one for each logical request and the
 * same one on every retry of it, and the retry returns the first attempt's result.
 */
export const requestKey = {
  "idempotency-key": Schema.optionalKey(Request.Key),
};
export const Conflict = GatewayErrors.Conflict.pipe(HttpApiSchema.status(409));
export const Uncertain = GatewayErrors.Uncertain.pipe(HttpApiSchema.status(500));
export const InvalidInput = GatewayErrors.InvalidInput.pipe(HttpApiSchema.status(400));
export const Denied = Authorization.Denied.pipe(HttpApiSchema.status(403));
export const InvalidActor = Authorization.InvalidActor.pipe(HttpApiSchema.status(403));
export const UnknownPermission = PermissionCatalog.Unknown.pipe(HttpApiSchema.status(400));
export const MemberNotFound = MemberApplication.NotFound.pipe(HttpApiSchema.status(404));
export const NotificationNotFound = NotificationApplication.NotFound.pipe(
  HttpApiSchema.status(404),
);
/** The notification is the caller's, but its source cannot be read now. */
export const NotificationSourceUnavailable = NotificationApplication.SourceUnavailable.pipe(
  HttpApiSchema.status(404),
);
/** Only a person acknowledges a notification; an agent's are handled by its work. */
export const NotificationHumanRecipientRequired =
  NotificationApplication.HumanRecipientRequired.pipe(HttpApiSchema.status(403));
export const NotificationAlreadyHandled = NotificationApplication.AlreadyHandled.pipe(
  HttpApiSchema.status(409),
);
export const TypingThreadNotFound = SignalApplication.ThreadNotFound.pipe(
  HttpApiSchema.status(404),
);
export const OwnerProtected = MemberApplication.OwnerProtected.pipe(HttpApiSchema.status(409));
export const AlreadyRemoved = MemberApplication.AlreadyRemoved.pipe(HttpApiSchema.status(409));
export const InvitationNotFound = InvitationApplication.NotFound.pipe(HttpApiSchema.status(404));
export const NotRecipient = InvitationApplication.NotRecipient.pipe(HttpApiSchema.status(403));
export const AlreadyMember = InvitationApplication.AlreadyMember.pipe(HttpApiSchema.status(409));
export const InvitationUnavailable = InvitationApplication.Unavailable.pipe(
  HttpApiSchema.status(410),
);
export const InvitationInvalidExpiry = InvitationApplication.InvalidExpiry.pipe(
  HttpApiSchema.status(400),
);
export const delegation = [
  Delegation.Denied.pipe(HttpApiSchema.status(403)),
  Delegation.OwnerProtected.pipe(HttpApiSchema.status(409)),
  Delegation.UnsupportedRole.pipe(HttpApiSchema.status(400)),
  Delegation.RoleNotFound.pipe(HttpApiSchema.status(404)),
] as const;
export const assignment = [
  ...delegation,
  AssignmentApplication.NotFound.pipe(HttpApiSchema.status(404)),
  AssignmentApplication.MemberNotFound.pipe(HttpApiSchema.status(404)),
  AssignmentApplication.InactiveMember.pipe(HttpApiSchema.status(409)),
  AssignmentApplication.Changed.pipe(HttpApiSchema.status(409)),
] as const;

export const ownership = [
  OwnershipApplication.NotOwner.pipe(HttpApiSchema.status(403)),
  OwnershipApplication.MemberNotFound.pipe(HttpApiSchema.status(404)),
  OwnershipApplication.InvalidRecipient.pipe(HttpApiSchema.status(409)),
  OwnershipApplication.Changed.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Group outcomes. A group the caller does not belong to is indistinguishable from a missing one;
 * a named member who cannot take part is a 409, and a fixed direct group refuses changes with 409.
 */
export const group = [
  GroupApplication.NotFound.pipe(HttpApiSchema.status(404)),
  GroupApplication.MemberNotFound.pipe(HttpApiSchema.status(404)),
  GroupApplication.InactiveMember.pipe(HttpApiSchema.status(409)),
] as const;
/** A direct group is named by its members and refuses a name with 409. */
export const NotRenamable = GroupApplication.NotRenamable.pipe(HttpApiSchema.status(409));
/** A group renamed since the caller last saw its name refuses another name with 409. */
export const GroupChanged = GroupApplication.Changed.pipe(HttpApiSchema.status(409));
export const groupMembership = [
  GroupMembershipApplication.GroupNotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipApplication.MemberNotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipApplication.NotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipApplication.InactiveMember.pipe(HttpApiSchema.status(409)),
  GroupMembershipApplication.AlreadyMember.pipe(HttpApiSchema.status(409)),
  GroupMembershipApplication.AlreadyRemoved.pipe(HttpApiSchema.status(409)),
  GroupMembershipApplication.FixedMembership.pipe(HttpApiSchema.status(409)),
  GroupMembershipApplication.GeneralMembership.pipe(HttpApiSchema.status(409)),
] as const;
export const groupFollow = [
  GroupFollowApplication.GroupNotFound.pipe(HttpApiSchema.status(404)),
  GroupFollowApplication.AgentRequired.pipe(HttpApiSchema.status(403)),
  GroupFollowApplication.MemberUnavailable.pipe(HttpApiSchema.status(409)),
  GroupFollowApplication.NotFollowable.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Thread outcomes. Missing threads and threads outside the caller's groups share a 404; an agent
 * principal writing where only people may is a 403; a named member who cannot take part is a 409.
 */
export const thread = [
  ThreadApplication.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadApplication.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ThreadApplication.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadApplication.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
  ThreadApplication.DirectMembersRequired.pipe(HttpApiSchema.status(400)),
] as const;
export const message = [
  ThreadMessageApplication.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageApplication.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageApplication.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
export const participation = [
  ThreadParticipationApplication.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationApplication.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationApplication.AlreadyEnded.pipe(HttpApiSchema.status(409)),
  ThreadParticipationApplication.FixedParticipation.pipe(HttpApiSchema.status(409)),
] as const;

/** Read-state outcomes: only people keep it, and a position cannot pass the latest activity. */
export const readState = [
  ReadStateApplication.HumanRequired.pipe(HttpApiSchema.status(403)),
  ReadStateApplication.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateApplication.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateApplication.BeyondTimeline.pipe(HttpApiSchema.status(409)),
] as const;

/** A connection the caller may not read answers as missing. */
export const ConnectionNotFound = ConnectionApplication.NotFound.pipe(HttpApiSchema.status(404));
/** A connection renamed since the caller last saw its name refuses another name with 409. */
export const ConnectionChanged = ConnectionApplication.Changed.pipe(HttpApiSchema.status(409));
/** The implementation is not installed on this host. */
export const UnknownImplementation = ConnectionApplication.UnknownImplementation.pipe(
  HttpApiSchema.status(422),
);
/** The settings are not what the implementation declares. */
export const InvalidSettings = ConnectionApplication.InvalidSettings.pipe(
  HttpApiSchema.status(422),
);
/** The implementation, or the connection, does not authenticate that way. */
export const UnsupportedAuthentication = ConnectionApplication.UnsupportedAuthentication.pipe(
  HttpApiSchema.status(422),
);
/** This host cannot store credentials now. */
export const CredentialsUnavailable = ConnectionApplication.CredentialsUnavailable.pipe(
  HttpApiSchema.status(503),
);

/** An environment the caller may not read answers as missing. */
export const EnvironmentNotFound = EnvironmentApplication.NotFound.pipe(HttpApiSchema.status(404));
/** An environment renamed since the caller last saw its name refuses another name with 409. */
export const EnvironmentChanged = EnvironmentApplication.Changed.pipe(HttpApiSchema.status(409));
/** The harness is not installed on this host. */
export const UnknownHarness = EnvironmentApplication.UnknownHarness.pipe(HttpApiSchema.status(422));
/** The sandbox provider is not installed on this host. */
export const UnknownSandboxProvider = EnvironmentApplication.UnknownSandboxProvider.pipe(
  HttpApiSchema.status(422),
);
/** The harness cannot run where the environment asks it to. */
export const UnsupportedPlacement = EnvironmentApplication.UnsupportedPlacement.pipe(
  HttpApiSchema.status(422),
);
/** The sandbox settings do not fit the provider, or the environment has no sandbox. */
export const InvalidSandbox = EnvironmentApplication.InvalidSandbox.pipe(HttpApiSchema.status(422));

/** An agent the caller may not read, or whose membership ended, answers as missing. */
export const AgentNotFound = AgentApplication.NotFound.pipe(HttpApiSchema.status(404));
/** An agent renamed since the caller last saw its name refuses another name with 409. */
export const AgentChanged = AgentApplication.Changed.pipe(HttpApiSchema.status(409));
/** The agent's connection is gone, or the caller may not read or use it. */
export const AgentConnectionUnavailable = AgentApplication.ConnectionUnavailable.pipe(
  HttpApiSchema.status(422),
);
/** The agent's environment is gone, or the caller may not read or use it. */
export const AgentEnvironmentUnavailable = AgentApplication.EnvironmentUnavailable.pipe(
  HttpApiSchema.status(422),
);
/** The environment cannot run the model access, for the reasons given. */
export const AgentIncompatible = AgentApplication.Incompatible.pipe(HttpApiSchema.status(422));

/** Outcomes every operation in a workspace shares: authorization, input, and storage. */
export const workspace = [
  Denied,
  InvalidActor,
  UnknownPermission,
  InvalidInput,
  Conflict,
  Uncertain,
] as const;

/** Outcomes every member operation shares: the workspace set plus membership. */
export const member = [NotMember, ...workspace] as const;

export * as ApiErrors from "./errors.ts";
