/**
 * The contract's error namespace: each gateway and core outcome an endpoint can answer with, given
 * its HTTP status, and the lists of them that groups spread into an endpoint's `error`. Core
 * declares no transport concerns, so the status lives here, on the contract's view of each error,
 * and the serialized tag stays the one core or the gateway declares. A name that would be ambiguous
 * in the shared namespace says its source, such as `InvitationNotFound` or `ConnectionChanged`.
 * `HumanRequired` and `TooManyStreams` are the contract's own, and `requestKey` is the
 * `Idempotency-Key` header a creating endpoint accepts.
 *
 * @since 0.1.0
 */
import {
  AssignmentService,
  Authorization,
  Delegation,
  PermissionCatalog,
} from "@amends-dev/core/authorization";
import {
  InvitationService,
  MemberService,
  OwnershipService,
  WorkspaceSettingsService,
} from "@amends-dev/core/workspace";
import * as GatewayErrors from "@amends-dev/gateway/GatewayErrors";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import { AgentService } from "@amends-dev/core/agent";
import { ChannelIntake, ChannelService } from "@amends-dev/core/channel";
import { TurnService } from "@amends-dev/core/turn";
import { ConnectionService } from "@amends-dev/core/connection";
import { NotificationService } from "@amends-dev/core/notification";
import { ReadStateService } from "@amends-dev/core/read-state";
import { TaskService } from "@amends-dev/core/task";
import {
  ThreadService,
  ThreadMessageService,
  ThreadParticipationService,
} from "@amends-dev/core/thread";
import { Request } from "@amends-dev/core/request";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/http-api";

/**
 * The principal is an agent where only a human may act; 403.
 *
 * @category errors
 * @since 0.1.0
 */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ApiErrors.HumanRequired",
  {},
  { httpApiStatus: 403 },
) {}

/**
 * The caller cannot open another live-update stream on this server now: the workspace, or the
 * caller within it, already has as many as it may. Retry after closing one.
 *
 * @category errors
 * @since 0.1.0
 */
export class TooManyStreams extends Schema.TaggedError<TooManyStreams>()(
  "ApiErrors.TooManyStreams",
  { limit: Schema.Literals(["workspace", "member"]) },
  { httpApiStatus: 429 },
) {}

/**
 * The principal holds no active membership of the workspace, or no workspace has this ID: 403.
 * The gateway answers it before loading the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotMember = GatewayErrors.NotMember.pipe(HttpApiSchema.status(403));
/**
 * The workspace's name is no longer the one the renamer expected: someone renamed it meanwhile;
 * 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const WorkspaceChanged = WorkspaceSettingsService.Changed.pipe(HttpApiSchema.status(409));
/**
 * No workspace was ever created under this ID: 404. Only the endpoints that enter a workspace
 * without a member, accepting an invitation and a channel's events, answer it; the others answer
 * `NotMember`.
 *
 * @category errors
 * @since 0.1.0
 */
export const WorkspaceNotFound = GatewayErrors.WorkspaceNotFound.pipe(HttpApiSchema.status(404));
/**
 * The request key a creating endpoint accepts: send a new one for each logical request and the
 * same one on every retry of it, and the retry returns the first attempt's result.
 *
 * @category schemas
 * @since 0.1.0
 */
export const requestKey = {
  "idempotency-key": Schema.optionalKey(Request.Key),
};
/**
 * Storage contention: the operation did not apply and may be retried; 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const Conflict = GatewayErrors.Conflict.pipe(HttpApiSchema.status(409));
/**
 * The commit's outcome is unknown, so the client reconciles what is stored before repeating it;
 * 500, with the commit's ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const Uncertain = GatewayErrors.Uncertain.pipe(HttpApiSchema.status(500));
/**
 * Core rejected the operation's input; 400.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvalidInput = GatewayErrors.InvalidInput.pipe(HttpApiSchema.status(400));
/**
 * No current grant of the caller's membership covers what the operation requires; 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const Denied = Authorization.Denied.pipe(HttpApiSchema.status(403));
/**
 * The acting membership is missing or removed, or its identity is not the principal's; 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvalidActor = Authorization.InvalidActor.pipe(HttpApiSchema.status(403));
/**
 * A permission name that no feature declared on this host; 400.
 *
 * @category errors
 * @since 0.1.0
 */
export const UnknownPermission = PermissionCatalog.Unknown.pipe(HttpApiSchema.status(400));
/**
 * No membership has this ID in the workspace; 404. Only a caller authorized on that member learns
 * it.
 *
 * @category errors
 * @since 0.1.0
 */
export const MemberNotFound = MemberService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * The notification is missing or another recipient's; the two answer alike, with 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotificationNotFound = NotificationService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * Only a person marks a notification seen; an agent's are handled by its work. 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotificationHumanRecipientRequired = NotificationService.HumanRecipientRequired.pipe(
  HttpApiSchema.status(403),
);
/**
 * The notification was already settled otherwise, so it is not marked seen; 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotificationAlreadyHandled = NotificationService.AlreadyHandled.pipe(
  HttpApiSchema.status(409),
);
/**
 * The member is the current owner, who is not removed until ownership is transferred; 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const OwnerProtected = MemberService.OwnerProtected.pipe(HttpApiSchema.status(409));
/**
 * The member was removed already; 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const AlreadyRemoved = MemberService.AlreadyRemoved.pipe(HttpApiSchema.status(409));
/**
 * No invitation has this ID in the workspace; 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvitationNotFound = InvitationService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * The principal is not the person the invitation was issued to; 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotRecipient = InvitationService.NotRecipient.pipe(HttpApiSchema.status(403));
/**
 * The invitation's recipient is an active member already; 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const AlreadyMember = InvitationService.AlreadyMember.pipe(HttpApiSchema.status(409));
/**
 * The invitation was accepted, revoked, or has expired, as its `reason` says; 410.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvitationUnavailable = InvitationService.Unavailable.pipe(HttpApiSchema.status(410));
/**
 * The invitation would expire no later than it is issued; 400.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvitationInvalidExpiry = InvitationService.InvalidExpiry.pipe(
  HttpApiSchema.status(400),
);
/**
 * The caller may not delegate this: only the owner gives Administrator, and only the owner changes
 * a member who holds a direct grant or a role other than Member; 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const DelegationDenied = Delegation.Denied.pipe(HttpApiSchema.status(403));
/**
 * The delegation rules' outcomes, which giving, changing, and taking away a role share:
 * `DelegationDenied` (403), the owner out of reach (409), a role other than the three built-in
 * ones (400), and a built-in role this workspace does not record (404).
 *
 * @category errors
 * @since 0.1.0
 */
export const delegation = [
  DelegationDenied,
  Delegation.OwnerProtected.pipe(HttpApiSchema.status(409)),
  Delegation.UnsupportedRole.pipe(HttpApiSchema.status(400)),
  Delegation.RoleNotFound.pipe(HttpApiSchema.status(404)),
] as const;
/**
 * Invitation outcomes, with the delegation rules issuing one checks.
 *
 * @category errors
 * @since 0.1.0
 */
export const invitation = [
  ...delegation,
  InvitationNotFound,
  NotRecipient,
  AlreadyMember,
  InvitationUnavailable,
  InvitationInvalidExpiry,
] as const;
/**
 * Assignment outcomes, with the delegation rules: a missing assignment or member is 404, and a
 * member no longer active, or access that changed since the caller read it, is 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const assignment = [
  ...delegation,
  AssignmentService.NotFound.pipe(HttpApiSchema.status(404)),
  AssignmentService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  AssignmentService.InactiveMember.pipe(HttpApiSchema.status(409)),
  AssignmentService.Changed.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Ownership outcomes: a caller who is not the owner is 403, a missing recipient 404, and a
 * recipient who cannot own the workspace, or an Owner assignment that moved since the caller read
 * it, 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const ownership = [
  OwnershipService.NotOwner.pipe(HttpApiSchema.status(403)),
  OwnershipService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  OwnershipService.InvalidRecipient.pipe(HttpApiSchema.status(409)),
  OwnershipService.Changed.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Group outcomes. A group the caller does not belong to is indistinguishable from a missing one,
 * and both are 404, as is a missing member named for a new team; a named member no longer active
 * is a 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const group = [
  GroupService.NotFound.pipe(HttpApiSchema.status(404)),
  GroupService.MemberNotFound.pipe(HttpApiSchema.status(404)),
  GroupService.InactiveMember.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * A direct group is named by its members and refuses a name with 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotRenamable = GroupService.NotRenamable.pipe(HttpApiSchema.status(409));
/**
 * A group renamed since the caller last saw its name refuses another name with 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const GroupChanged = GroupService.Changed.pipe(HttpApiSchema.status(409));
/**
 * Admission outcomes: a missing group, member, or admission is 404; a member no longer active, one
 * admitted already, an admission ended already, and the fixed roster of a direct or the general
 * group are 409.
 *
 * @category errors
 * @since 0.1.0
 */
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
/**
 * Following outcomes: a missing group, or one the caller does not belong to, is 404; making someone
 * other than an agent follow is 403; and a member missing, inactive, or outside the group, or a
 * direct group, whose members already take part in every thread, is 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const groupFollow = [
  GroupFollowService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  GroupFollowService.AgentRequired.pipe(HttpApiSchema.status(403)),
  GroupFollowService.MemberUnavailable.pipe(HttpApiSchema.status(409)),
  GroupFollowService.NotFollowable.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Thread outcomes. Missing threads and threads outside the caller's groups share a 404; an agent
 * principal writing where only people may is a 403; a named member who cannot take part is a 409;
 * and a direct thread without another member is a 400.
 *
 * @category errors
 * @since 0.1.0
 */
export const thread = [
  ThreadService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ThreadService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
  ThreadService.DirectMembersRequired.pipe(HttpApiSchema.status(400)),
] as const;
/**
 * A thread renamed since the caller last saw its title refuses another title with 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const ThreadChanged = ThreadService.Changed.pipe(HttpApiSchema.status(409));
/**
 * Replying outcomes: a thread missing or outside the caller's groups is 404, an agent principal
 * 403, and a mentioned member who cannot take part 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const message = [
  ThreadMessageService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Editing a message: a missing one, or one in a thread outside the caller's groups, is 404; one
 * someone else wrote is 403; a deleted one, a stale revision, and an unavailable mention are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const messageEdit = [
  ThreadMessageService.MessageNotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.NotAuthor.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.Deleted.pipe(HttpApiSchema.status(409)),
  ThreadMessageService.Changed.pipe(HttpApiSchema.status(409)),
  ThreadMessageService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Deleting a message: a missing or unreadable one is 404; an agent principal is 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const messageDelete = [
  ThreadMessageService.MessageNotFound.pipe(HttpApiSchema.status(404)),
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
] as const;
/**
 * Saying one is typing: a thread missing or outside the caller's groups is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const typing = [ThreadMessageService.NotFound.pipe(HttpApiSchema.status(404))] as const;
/**
 * Following a thread: a missing thread, or a participation missing or not the caller's, is 404; a
 * participation ended already, and a direct conversation, where everyone takes part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const participation = [
  ThreadParticipationService.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationService.NotFound.pipe(HttpApiSchema.status(404)),
  ThreadParticipationService.AlreadyEnded.pipe(HttpApiSchema.status(409)),
  ThreadParticipationService.FixedParticipation.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Task outcomes. A thread the caller cannot read, or without a task, is 404, as is a group the
 * caller does not belong to; a thread that is a task already, a change to a value that changed
 * meanwhile, and an assignee who cannot take part are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskRead = [
  TaskService.NotFound.pipe(HttpApiSchema.status(404)),
  TaskService.GroupNotFound.pipe(HttpApiSchema.status(404)),
] as const;
/**
 * Making a conversation a task: a missing or unreadable thread is 404; a thread that is a task
 * already, and an assignee who cannot take part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskCreate = [
  TaskService.NotFound.pipe(HttpApiSchema.status(404)),
  TaskService.AlreadyTask.pipe(HttpApiSchema.status(409)),
  TaskService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Changing a task: a thread missing, unreadable, or without a task is 404; a value that changed
 * meanwhile, and an assignee who cannot take part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskUpdate = [
  TaskService.NotFound.pipe(HttpApiSchema.status(404)),
  TaskService.Changed.pipe(HttpApiSchema.status(409)),
  TaskService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * Read-state outcomes: only people keep it, and a position cannot pass the latest activity.
 *
 * @category errors
 * @since 0.1.0
 */
export const readState = [
  ReadStateService.HumanRequired.pipe(HttpApiSchema.status(403)),
  ReadStateService.ThreadNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ReadStateService.BeyondTimeline.pipe(HttpApiSchema.status(409)),
] as const;

/**
 * A connection the caller may not read answers as missing, as does one removed since a create.
 *
 * @category errors
 * @since 0.1.0
 */
export const ConnectionNotFound = ConnectionService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * A connection renamed since the caller last saw its name refuses another name with 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const ConnectionChanged = ConnectionService.Changed.pipe(HttpApiSchema.status(409));
/**
 * The integration is not installed on this host.
 *
 * @category errors
 * @since 0.1.0
 */
export const UnknownIntegration = ConnectionService.UnknownIntegration.pipe(
  HttpApiSchema.status(422),
);
/**
 * The integration does not take the connection's settings or auth method, as it describes.
 *
 * @category errors
 * @since 0.1.0
 */
export const InvalidConnection = ConnectionService.InvalidConnection.pipe(
  HttpApiSchema.status(422),
);
/**
 * The connection authenticates with nothing, so it takes no key.
 *
 * @category errors
 * @since 0.1.0
 */
export const Keyless = ConnectionService.Keyless.pipe(HttpApiSchema.status(422));
/**
 * This host keeps no credentials, so no key can be stored or read.
 *
 * @category errors
 * @since 0.1.0
 */
export const ConnectionCredentialsUnavailable = ConnectionService.CredentialsUnavailable.pipe(
  HttpApiSchema.status(503),
);

/**
 * An agent the caller may not read, or whose membership ended, answers as missing.
 *
 * @category errors
 * @since 0.1.0
 */
export const AgentNotFound = AgentService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * An agent renamed since the caller last saw its name refuses another name with 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const AgentChanged = AgentService.Changed.pipe(HttpApiSchema.status(409));
/**
 * A connection the setup names is missing or removed, or the caller may not read and use it.
 *
 * @category errors
 * @since 0.1.0
 */
export const AgentConnectionUnavailable = AgentService.ConnectionUnavailable.pipe(
  HttpApiSchema.status(422),
);
/**
 * The agent could not run as it would be set up, for the issues given.
 *
 * @category errors
 * @since 0.1.0
 */
export const AgentIncomplete = AgentService.Incomplete.pipe(HttpApiSchema.status(422));

/**
 * A turn the caller may not read, because its thread is closed to them, answers as missing.
 *
 * @category errors
 * @since 0.1.0
 */
export const TurnNotFound = TurnService.NotFound.pipe(HttpApiSchema.status(404));
/**
 * The turn has already finished, so there is nothing to stop.
 *
 * @category errors
 * @since 0.1.0
 */
export const TurnNotActive = TurnService.NotActive.pipe(HttpApiSchema.status(409));
/**
 * The turn can't run again, for the reason given.
 *
 * @category errors
 * @since 0.1.0
 */
export const TurnNotRetryable = TurnService.NotRetryable.pipe(HttpApiSchema.status(409));

/**
 * Outcomes every operation in a workspace shares: authorization, input, and storage.
 *
 * @category errors
 * @since 0.1.0
 */
export const workspace = [
  Denied,
  InvalidActor,
  UnknownPermission,
  InvalidInput,
  Conflict,
  Uncertain,
] as const;

/**
 * Outcomes every member operation shares: the workspace set plus membership.
 *
 * @category errors
 * @since 0.1.0
 */
export const member = [NotMember, ...workspace] as const;

/**
 * Channel outcomes. A channel the caller may not read, or removed, is 404, as is a group the caller
 * does not belong to and a thread bound to no conversation; a connection that gives no channels, or
 * that the caller may not use, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelRead = [ChannelService.NotFound.pipe(HttpApiSchema.status(404))] as const;
/**
 * Creating a channel: a group the caller does not belong to is 404, and a connection that gives no
 * channels, or that the caller may not use, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelCreate = [
  ...channelRead,
  ChannelService.GroupNotFound.pipe(HttpApiSchema.status(404)),
  ChannelService.ConnectionUnavailable.pipe(HttpApiSchema.status(422)),
] as const;
/**
 * Redirecting a channel: a channel or destination group the caller cannot reach is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelRedirect = [
  ...channelRead,
  ChannelService.GroupNotFound.pipe(HttpApiSchema.status(404)),
] as const;
/**
 * Where a thread came from: a thread missing, unreadable, or that came through no channel is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelBinding = [ChannelService.NotBound.pipe(HttpApiSchema.status(404))] as const;
/**
 * What an external system's request to a channel can be answered with: a channel missing or removed
 * is 404, a request its transport rejects 400, and a system that cannot be reached 503.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelEvents = [
  ChannelIntake.NotFound.pipe(HttpApiSchema.status(404)),
  ChannelIntake.Rejected.pipe(HttpApiSchema.status(400)),
  ChannelIntake.Unavailable.pipe(HttpApiSchema.status(503)),
] as const;
