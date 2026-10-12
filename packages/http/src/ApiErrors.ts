/**
 * The contract's error namespace: each gateway and core outcome an endpoint can answer with, given
 * its HTTP status, and the lists of them that groups spread into an endpoint's `error`. Core
 * declares no transport concerns, so the status lives here, on the contract's view of each error,
 * and the serialized tag stays the one core or the gateway declares. A name that would be ambiguous
 * in the shared namespace says its source, such as `InvitationUnavailable` or `TurnNotActive`.
 * `HumanRequired` and `TooManyStreams` are the contract's own, and `requestKey` is the
 * `Idempotency-Key` header a creating endpoint accepts.
 *
 * @since 0.1.0
 */
import { AssignmentService, Authorization, Delegation } from "@amends-dev/core/authorization";
import { InvitationService, MemberService, OwnershipService } from "@amends-dev/core/workspace";
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
import { CoreError } from "@amends-dev/core/error";

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
 * Something the caller named is missing, or out of their reach, which answer alike: 404, with the
 * resource and the ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotFound = CoreError.NotFound.pipe(HttpApiSchema.status(404));
/**
 * What the caller expected of a resource, such as its name, title, revision, or roles, changed
 * since they read it, and nothing was recorded: 409, with the resource and the ID.
 *
 * @category errors
 * @since 0.1.0
 */
export const Changed = CoreError.Changed.pipe(HttpApiSchema.status(409));
/**
 * The principal holds no active membership of the workspace, or no workspace has this ID: 403.
 * The gateway answers it before loading the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export const NotMember = GatewayErrors.NotMember.pipe(HttpApiSchema.status(403));
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
  NotFound,
] as const;
/**
 * Invitation outcomes, with the delegation rules issuing one checks.
 *
 * @category errors
 * @since 0.1.0
 */
export const invitation = [
  ...delegation,
  NotRecipient,
  AlreadyMember,
  InvitationUnavailable,
  InvitationInvalidExpiry,
] as const;
/**
 * Reading a member's access, with the delegation rules it shows: a missing member is 404, and one
 * no longer active 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const assignmentRead = [
  ...delegation,
  AssignmentService.InactiveMember.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Assignment outcomes: those of reading a member's access, and a missing assignment, 404, or
 * access that changed since the caller read it, 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const assignment = [...assignmentRead, Changed] as const;

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
  NotFound,
  OwnershipService.InvalidRecipient.pipe(HttpApiSchema.status(409)),
  Changed,
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
  NotFound,
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
 * Admission outcomes: a missing group, member, or admission is 404; a member no longer active, one
 * admitted already, an admission ended already, and the fixed roster of a direct or the general
 * group are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const groupMembership = [
  NotFound,
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
  NotFound,
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
  NotFound,
  ThreadService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
  ThreadService.DirectMembersRequired.pipe(HttpApiSchema.status(400)),
] as const;
/**
 * Replying outcomes: a thread missing or outside the caller's groups is 404, an agent principal
 * 403, and a mentioned member who cannot take part 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const message = [
  NotFound,
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
  NotFound,
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.NotAuthor.pipe(HttpApiSchema.status(403)),
  ThreadMessageService.Deleted.pipe(HttpApiSchema.status(409)),
  Changed,
  ThreadMessageService.ParticipantUnavailable.pipe(HttpApiSchema.status(409)),
] as const;
/**
 * Deleting a message: a missing or unreadable one is 404; an agent principal is 403.
 *
 * @category errors
 * @since 0.1.0
 */
export const messageDelete = [
  NotFound,
  ThreadMessageService.HumanAuthorRequired.pipe(HttpApiSchema.status(403)),
] as const;
/**
 * Saying one is typing: a thread missing or outside the caller's groups is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const typing = [NotFound] as const;
/**
 * Following a thread: a missing thread, or a participation missing or not the caller's, is 404; a
 * participation ended already, and a direct conversation, where everyone takes part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const participation = [
  NotFound,
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
export const taskRead = [NotFound] as const;
/**
 * Making a conversation a task: a missing or unreadable thread is 404; a thread that is a task
 * already, and an assignee who cannot take part, are 409.
 *
 * @category errors
 * @since 0.1.0
 */
export const taskCreate = [
  NotFound,
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
  NotFound,
  Changed,
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
  NotFound,
  ReadStateService.BeyondTimeline.pipe(HttpApiSchema.status(409)),
] as const;

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
export const workspace = [Denied, InvalidActor, InvalidInput, Conflict, Uncertain] as const;

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
export const channelRead = [NotFound] as const;
/**
 * Creating a channel: a group the caller does not belong to is 404, and a connection that gives no
 * channels, or that the caller may not use, is 422.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelCreate = [
  ...channelRead,
  ChannelService.ConnectionUnavailable.pipe(HttpApiSchema.status(422)),
] as const;
/**
 * Redirecting a channel: a channel or destination group the caller cannot reach is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelRedirect = [...channelRead] as const;
/**
 * Where a thread came from: a thread missing, unreadable, or that came through no channel is 404.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelBinding = [NotFound] as const;
/**
 * What an external system's request to a channel can be answered with: a channel missing or removed
 * is 404, a request its transport rejects 400, and a system that cannot be reached 503.
 *
 * @category errors
 * @since 0.1.0
 */
export const channelEvents = [
  NotFound,
  ChannelIntake.Rejected.pipe(HttpApiSchema.status(400)),
  ChannelIntake.Unavailable.pipe(HttpApiSchema.status(503)),
] as const;
