import {
  AssignmentService,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends/core/authorization";
import {
  InvitationService,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService,
} from "@amends/core/workspace";
import { GatewayErrors } from "@amends/gateway/errors";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends/core/group";
import { AgentService } from "@amends/core/agent";
import { TurnService } from "@amends/core/turn";
import { ConnectionService } from "@amends/core/connection";
import { NotificationService } from "@amends/core/notification";
import { ReadStateService } from "@amends/core/read-state";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends/core/thread";
import { Request } from "@amends/core/request";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/http-api";

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
export const WorkspaceChanged = WorkspaceSettingsService.Changed.pipe(HttpApiSchema.status(409));
export const WorkspaceNotFound = GatewayErrors.WorkspaceNotFound.pipe(HttpApiSchema.status(404));
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
export const MemberNotFound = MemberService.NotFound.pipe(HttpApiSchema.status(404));
export const NotificationNotFound = NotificationService.NotFound.pipe(HttpApiSchema.status(404));
/** Only a person marks a notification seen; an agent's are handled by its work. */
export const NotificationHumanRecipientRequired = NotificationService.HumanRecipientRequired.pipe(
  HttpApiSchema.status(403),
);
export const NotificationAlreadyHandled = NotificationService.AlreadyHandled.pipe(
  HttpApiSchema.status(409),
);
export const OwnerProtected = MemberService.OwnerProtected.pipe(HttpApiSchema.status(409));
export const AlreadyRemoved = MemberService.AlreadyRemoved.pipe(HttpApiSchema.status(409));
export const InvitationNotFound = InvitationService.NotFound.pipe(HttpApiSchema.status(404));
export const NotRecipient = InvitationService.NotRecipient.pipe(HttpApiSchema.status(403));
export const AlreadyMember = InvitationService.AlreadyMember.pipe(HttpApiSchema.status(409));
export const InvitationUnavailable = InvitationService.Unavailable.pipe(HttpApiSchema.status(410));
export const InvitationInvalidExpiry = InvitationService.InvalidExpiry.pipe(
  HttpApiSchema.status(400),
);
export const DelegationDenied = Delegation.Denied.pipe(HttpApiSchema.status(403));
export const delegation = [
  DelegationDenied,
  Delegation.OwnerProtected.pipe(HttpApiSchema.status(409)),
  Delegation.UnsupportedRole.pipe(HttpApiSchema.status(400)),
  Delegation.RoleNotFound.pipe(HttpApiSchema.status(404)),
] as const;
export const assignment = [
  ...delegation,
  AssignmentService.NotFound.pipe(HttpApiSchema.status(404)),
  AssignmentService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  AssignmentService.InactiveMember.pipe(HttpApiSchema.status(409)),
  AssignmentService.Changed.pipe(HttpApiSchema.status(409)),
] as const;

export const ownership = [
  OwnershipService.NotOwner.pipe(HttpApiSchema.status(403)),
  OwnershipService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  OwnershipService.InvalidRecipient.pipe(HttpApiSchema.status(409)),
  OwnershipService.Changed.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Group outcomes. A group the caller does not belong to is indistinguishable from a missing one;
 * a named member who cannot take part is a 409, and a fixed direct group refuses changes with 409.
 */
export const group = [
  GroupService.NotFound.pipe(HttpApiSchema.status(404)),
  GroupService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  GroupService.InactiveMember.pipe(HttpApiSchema.status(409)),
] as const;
/** A direct group is named by its members and refuses a name with 409. */
export const NotRenamable = GroupService.NotRenamable.pipe(HttpApiSchema.status(409));
/** A group renamed since the caller last saw its name refuses another name with 409. */
export const GroupChanged = GroupService.Changed.pipe(HttpApiSchema.status(409));
export const groupMembership = [
  GroupMembershipService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipService.NotFound.pipe(HttpApiSchema.status(404)),
  GroupMembershipService.InactiveMember.pipe(HttpApiSchema.status(409)),
  GroupMembershipService.AlreadyMember.pipe(HttpApiSchema.status(409)),
  GroupMembershipService.AlreadyRemoved.pipe(HttpApiSchema.status(409)),
  GroupMembershipService.FixedMembership.pipe(HttpApiSchema.status(409)),
  GroupMembershipService.GeneralMembership.pipe(HttpApiSchema.status(409)),
] as const;
export const groupFollow = [
  GroupFollowService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  GroupFollowService.AgentRequired.pipe(HttpApiSchema.status(403)),
  GroupFollowService.MemberUnavailable.pipe(HttpApiSchema.status(409)),
  GroupFollowService.NotFollowable.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Thread outcomes. Missing threads and threads outside the caller's groups share a 404; an agent
 * principal writing where only people may is a 403; a named member who cannot take part is a 409.
 */
export const thread = [
  ThreadService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ThreadService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
  ThreadService.DirectMembersRequired.pipe(HttpApiSchema.status(400)),
] as const;
/** A thread renamed since the caller last saw its title refuses another title with 409. */
export const ThreadChanged = ThreadService.Changed.pipe(HttpApiSchema.status(409));
export const message = [
  ThreadMessageService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Editing a message: a missing one, or one in a thread outside the caller's groups, is 404; one
 * someone else wrote is 403; a deleted one, a stale revision, and an unavailable mention are 409.
 */
export const messageEdit = [
  ThreadMessageService.MessageNotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.NotAuthor.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.Deleted.pipe(HttpApiSchema.status(409)),
  ThreadMessageService.Changed.pipe(HttpApiSchema.status(409)),
  ThreadMessageService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/** Deleting a message: a missing or unreadable one is 404; an agent principal is 403. */
export const messageDelete = [
  ThreadMessageService.MessageNotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
] as const;
export const typing = [ThreadMessageService.NotFound.pipe(HttpApiSchema.status(404))] as const;
export const participation = [
  ThreadParticipationService.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationService.AlreadyEnded.pipe(HttpApiSchema.status(409)),
  ThreadParticipationService.FixedParticipation.pipe(HttpApiSchema.status(409)),
] as const;

/** Read-state outcomes: only people keep it, and a position cannot pass the latest activity. */
export const readState = [
  ReadStateService.HumanRequired.pipe(HttpApiSchema.status(403)),
  ReadStateService.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateService.BeyondTimeline.pipe(HttpApiSchema.status(409)),
] as const;

/** A connection the caller may not read answers as missing, as does one removed since a create. */
export const ConnectionNotFound = ConnectionService.NotFound.pipe(HttpApiSchema.status(404));
/** A connection renamed since the caller last saw its name refuses another name with 409. */
export const ConnectionChanged = ConnectionService.Changed.pipe(HttpApiSchema.status(409));
/** The integration is not installed on this host. */
export const UnknownIntegration = ConnectionService.UnknownIntegration.pipe(
  HttpApiSchema.status(422),
);
/** The integration does not take the connection's settings or auth method, as it describes. */
export const InvalidConnection = ConnectionService.InvalidConnection.pipe(
  HttpApiSchema.status(422),
);
/** The connection authenticates with nothing, so it takes no key. */
export const Keyless = ConnectionService.Keyless.pipe(HttpApiSchema.status(422));
/** This host keeps no credentials, so no key can be stored or read. */
export const ConnectionCredentialsUnavailable = ConnectionService.CredentialsUnavailable.pipe(
  HttpApiSchema.status(503),
);

/** An agent the caller may not read, or whose membership ended, answers as missing. */
export const AgentNotFound = AgentService.NotFound.pipe(HttpApiSchema.status(404));
/** An agent renamed since the caller last saw its name refuses another name with 409. */
export const AgentChanged = AgentService.Changed.pipe(HttpApiSchema.status(409));
/** A connection the setup names is missing or removed, or the caller may not read and use it. */
export const AgentConnectionUnavailable = AgentService.ConnectionUnavailable.pipe(
  HttpApiSchema.status(422),
);
/** The agent could not run as it would be set up, for the issues given. */
export const AgentIncomplete = AgentService.Incomplete.pipe(HttpApiSchema.status(422));

/** A turn the caller may not read, because its thread is closed to them, answers as missing. */
export const TurnNotFound = TurnService.NotFound.pipe(HttpApiSchema.status(404));
/** The turn has already finished, so there is nothing to stop. */
export const TurnNotActive = TurnService.NotActive.pipe(HttpApiSchema.status(409));
/** The turn can't run again, for the reason given. */
export const TurnNotRetryable = TurnService.NotRetryable.pipe(HttpApiSchema.status(409));

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
