import { AgentPermissions } from "./agent/permissions.ts";
import { ThreadApplication } from "./thread/application.ts";
import { ThreadCreation } from "./thread/creation.ts";
import { ThreadStart } from "./thread/start.ts";
import { DirectGroups } from "./group/direct.ts";
import { ThreadAccess } from "./thread/access.ts";
import { ThreadMessageApplication } from "./thread/message/application.ts";
import { ThreadMessagePublication } from "./thread/message/publication.ts";
import { ThreadMessagePermissions } from "./thread/message/permissions.ts";
import { ThreadParticipationAdmission } from "./thread/participation/admission.ts";
import { ThreadParticipationApplication } from "./thread/participation/application.ts";
import { ThreadParticipationPermissions } from "./thread/participation/permissions.ts";
import { ThreadParticipationDeparture } from "./thread/participation/departure.ts";
import { ThreadActivityRecording } from "./thread/activity/recording.ts";
import { ThreadActivityReading } from "./thread/activity/reading.ts";
import { NotificationSource } from "./notification/source.ts";
import { GroupMembershipDeparture } from "./group/membership/departure.ts";
import { ThreadPermissions } from "./thread/permissions.ts";
import { ThreadProjection } from "./thread/projection.ts";
import { ThreadParticipationProjection } from "./thread/participation/projection.ts";
import { ThreadMessageProjection } from "./thread/message/projection.ts";
import { ThreadActivityProjection } from "./thread/activity/projection.ts";
/**
 * Compose one workspace's core from its domains. Hosts bind storage to a
 * workspace and supply cryptography; a gateway resolves the acting member and
 * runs the application operations.
 */
import { Layer } from "effect";
import { ChangeFeedApplication } from "./change-feed/application.ts";
import { ChangeFeedSource } from "./change-feed/source.ts";
import { SignalApplication } from "./signal/application.ts";
import { GroupApplication } from "./group/application.ts";
import { GroupAudience } from "./group/audience.ts";
import { GroupProjection } from "./group/projection.ts";
import { GroupMembershipProjection } from "./group/membership/projection.ts";
import { GroupFollowApplication } from "./group/follow/application.ts";
import { GroupFollowProjection } from "./group/follow/projection.ts";
import { ReadStateApplication } from "./attention/application.ts";
import { ThreadReading } from "./attention/reading.ts";
import { GroupMembershipApplication } from "./group/membership/application.ts";
import { GroupMembershipPermissions } from "./group/membership/permissions.ts";
import { GroupPermissions } from "./group/permissions.ts";
import { AssignmentProjection } from "./authorization/assignment/projection.ts";
import { AssignmentApplication } from "./authorization/assignment/application.ts";
import { AssignmentPermissions } from "./authorization/assignment/permissions.ts";
import { Delegation } from "./authorization/delegation.ts";
import { Authorization } from "./authorization/authorization.ts";
import { GrantResolver } from "./authorization/grant-resolver.ts";
import { PermissionCatalog } from "./authorization/permission-catalog.ts";
import { RoleProjection } from "./authorization/role/projection.ts";
import { Journal } from "./journal/journal.ts";
import { Log } from "./journal/log.ts";
import { NotificationApplication } from "./notification/application.ts";
import { NotificationProjection } from "./notification/projection.ts";
import { InvitationApplication } from "./workspace/invitation/application.ts";
import { InvitationPermissions } from "./workspace/invitation/permissions.ts";
import { InvitationProjection } from "./workspace/invitation/projection.ts";
import { MemberApplication } from "./workspace/member/application.ts";
import { MemberPermissions } from "./workspace/member/permissions.ts";
import { MemberProjection } from "./workspace/member/projection.ts";
import { WorkspaceProjection } from "./workspace/projection.ts";
import { OwnershipApplication } from "./workspace/ownership/application.ts";
import { OwnershipPermissions } from "./workspace/ownership/permissions.ts";

/** Projections registered for journal publication, applied in this order. */
const projections = [
  WorkspaceProjection.definition,
  MemberProjection.definition,
  RoleProjection.definition,
  AssignmentProjection.definition,
  InvitationProjection.definition,
  GroupProjection.definition,
  GroupMembershipProjection.definition,
  GroupFollowProjection.definition,
  ThreadProjection.definition,
  ThreadParticipationProjection.definition,
  ThreadMessageProjection.definition,
  ThreadActivityProjection.definition,
  NotificationProjection.definition,
] as const;

/** Permissions the domains declare; requirements and grants must name one of these. */
const permissions = [
  MemberPermissions.Read,
  MemberPermissions.Remove,
  InvitationPermissions.Manage,
  AssignmentPermissions.Read,
  AssignmentPermissions.Manage,
  OwnershipPermissions.Transfer,
  GroupPermissions.Create,
  GroupPermissions.Read,
  GroupPermissions.Follow,
  GroupMembershipPermissions.Manage,
  ThreadPermissions.Start,
  ThreadPermissions.Read,
  ThreadMessagePermissions.Publish,
  ThreadParticipationPermissions.Follow,
  AgentPermissions.Use,
];

/**
 * The workspace journal's log. A workspace that was never created has no batch in it, which
 * hosts can check without booting the workspace.
 */
export const journalLog = Log.Id.make("journal");

/** The domain journal and its log, over host storage. */
const journal = Journal.layer({ logId: journalLog, projections }).pipe(
  Layer.provideMerge(Log.layer),
);

/** Authorization for the acting member, with its grant resolution. */
const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));

const admissions = ThreadParticipationAdmission.layer;
const recording = ThreadActivityRecording.layer;
const departures = ThreadParticipationDeparture.layer.pipe(Layer.provide(recording));
const groupDeparture = GroupMembershipDeparture.layer.pipe(Layer.provide(departures));
const messagePublication = ThreadMessagePublication.layer.pipe(
  Layer.provide(Layer.mergeAll(admissions, recording)),
);
const threadStart = ThreadStart.layer.pipe(
  Layer.provide(Layer.mergeAll(ThreadCreation.layer, messagePublication)),
);
const threadAccess = ThreadAccess.layer.pipe(Layer.provide(GroupAudience.layer));
const activityReading = ThreadActivityReading.layer.pipe(Layer.provide(threadAccess));
const notificationSource = NotificationSource.layer.pipe(Layer.provide(activityReading));
const threadReading = ThreadReading.layer;
/** One journal follower per workspace runtime, shared by its change-feed subscribers. */
const changeFeed = ChangeFeedApplication.layer.pipe(
  Layer.provide(Layer.mergeAll(ChangeFeedSource.layer(), GrantResolver.layer)),
);

/**
 * Application operations, sharing one journal and one authorization check. These
 * are what hosts and protocols call; stores and the journal stay internal.
 */
const operations = Layer.mergeAll(
  MemberApplication.layer,
  InvitationApplication.layer,
  AssignmentApplication.layer,
  OwnershipApplication.layer,
  NotificationApplication.layer,
  changeFeed,
  GroupApplication.layer,
  GroupMembershipApplication.layer,
  GroupFollowApplication.layer,
  ThreadApplication.layer,
  ReadStateApplication.layer,
  ThreadMessageApplication.layer,
  ThreadParticipationApplication.layer,
  SignalApplication.layer,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Delegation.layer,
      GroupAudience.layer,
      DirectGroups.layer,
      threadStart,
      threadAccess,
      activityReading,
      notificationSource,
      threadReading,
      admissions,
      recording,
      departures,
      groupDeparture,
      messagePublication,
    ),
  ),
);

/**
 * Complete core for one workspace: application operations over the journal,
 * authorization, and the permission catalog.
 *
 * @category layers
 */
export const layer = operations.pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
  Layer.provideMerge(PermissionCatalog.layer(permissions)),
);

/**
 * Host-provided dependencies derived from the layer: workspace-bound stores, the checkpoint
 * store, cryptography, and the workspace's signals. Adding a required store changes this type
 * and makes incomplete host compositions fail type checking.
 *
 * @category models
 */
export type HostServices = Layer.Services<typeof layer>;

/**
 * The application services a host runs for an actor. Programs a gateway
 * accepts may require only these, so they cannot bypass the membership and
 * permission checks each operation performs.
 *
 * @category models
 */
export type Operations = Layer.Success<typeof operations>;
