import { AgentApplication } from "./agent/application.ts";
import { AgentPermissions } from "./agent/permissions.ts";
import { AgentProjection } from "./agent/projection.ts";
import { TurnCommand } from "./turn/command.ts";
import { TurnApplication } from "./turn/application.ts";
import { TurnDispatch } from "./turn/dispatch.ts";
import { TurnExecution } from "./turn/execution.ts";
import { TurnProjection } from "./turn/projection.ts";
import { ConnectionApplication } from "./connection/application.ts";
import { ConnectionPermissions } from "./connection/permissions.ts";
import { ConnectionProjection } from "./connection/projection.ts";
import { EnvironmentApplication } from "./environment/application.ts";
import { EnvironmentPermissions } from "./environment/permissions.ts";
import { EnvironmentProjection } from "./environment/projection.ts";
import { BackgroundRuns } from "./background/runs.ts";
import { BackgroundWakes } from "./background/wakes.ts";
import { ThreadApplication } from "./thread/application.ts";
import { ThreadCommand } from "./thread/command.ts";
import { GroupCommand } from "./group/command.ts";
import { ThreadQuery } from "./thread/query.ts";
import { ThreadMessageApplication } from "./thread/message/application.ts";
import { ThreadMessagePermissions } from "./thread/message/permissions.ts";
import { ThreadParticipationApplication } from "./thread/participation/application.ts";
import { ThreadParticipationPermissions } from "./thread/participation/permissions.ts";
import { ThreadActivityResolvers } from "./thread/activity/resolvers.ts";
import { ThreadMessageTimeline } from "./thread/message/timeline.ts";
import { ThreadParticipationTimeline } from "./thread/participation/timeline.ts";
import { TurnQuery } from "./turn/query.ts";
import { TurnTimeline } from "./turn/timeline.ts";
import { NotificationSource } from "./notification/source.ts";
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
import { GroupQuery } from "./group/query.ts";
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
import type { Reaction } from "./journal/reaction.ts";
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
import { WorkspaceSettingsApplication } from "./workspace/settings/application.ts";
import { WorkspaceSettingsPermissions } from "./workspace/settings/permissions.ts";

/**
 * Projections registered for journal publication, applied in this order. Each derives its records
 * from facts and its own store alone, so any order rebuilds the same read models.
 */
export const projections = [
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
  ConnectionProjection.definition,
  EnvironmentProjection.definition,
  AgentProjection.definition,
  TurnProjection.definition,
] as const;

/**
 * Permissions the domains declare; requirements and grants must name one of these. Their tiers
 * make the built-in role bundles, pinned by revision.
 */
export const permissions = [
  WorkspaceSettingsPermissions.Rename,
  MemberPermissions.Read,
  MemberPermissions.Remove,
  InvitationPermissions.Manage,
  AssignmentPermissions.Read,
  AssignmentPermissions.Manage,
  OwnershipPermissions.Transfer,
  GroupPermissions.Create,
  GroupPermissions.Read,
  GroupPermissions.Follow,
  GroupPermissions.Rename,
  GroupPermissions.Moderate,
  GroupMembershipPermissions.Manage,
  GroupMembershipPermissions.Join,
  ThreadPermissions.Start,
  ThreadPermissions.Read,
  ThreadMessagePermissions.Publish,
  ThreadParticipationPermissions.Follow,
  AgentPermissions.Use,
  ConnectionPermissions.Create,
  ConnectionPermissions.Read,
  ConnectionPermissions.Manage,
  ConnectionPermissions.Use,
  EnvironmentPermissions.Create,
  EnvironmentPermissions.Read,
  EnvironmentPermissions.Manage,
  EnvironmentPermissions.Use,
  AgentPermissions.Create,
  AgentPermissions.Read,
  AgentPermissions.Configure,
];

/**
 * How each kind of thread activity appears in a timeline, one resolver per owning domain. A domain
 * that records a new kind adds its resolver here, and its timeline item schema to `ThreadTimeline`.
 */
const activityResolvers = [
  ThreadMessageTimeline.resolver,
  ThreadParticipationTimeline.resolver,
  TurnTimeline.resolver,
] as const;

/**
 * The workspace journal's log. A workspace that was never created has no batch in it, which
 * hosts can check without booting the workspace.
 */
export const journalLog = Log.Id.make("journal");

/**
 * Work the domains do outside requests, in each workspace. A process runs from what is stored, and
 * a commit that publishes a fact it wakes on asks for it to run in that same commit. A domain that
 * adds background work registers its process here.
 */
export const processes = [TurnCommand.acceptWorkProcess, TurnCommand.stopDepartedProcess] as const;

/** The domain journal and its log, over host storage; its commits ask for background work. */
const journal = Journal.layer({
  logId: journalLog,
  projections,
  reactions: [...BackgroundWakes.reactions(processes), ...TurnDispatch.reactions] as ReadonlyArray<
    Reaction.Definition<BackgroundWakes.Service | TurnDispatch.Service>
  >,
}).pipe(Layer.provideMerge(Log.layer));

/** Authorization for the acting member, with its grant resolution. */
const authorization = Authorization.layer.pipe(Layer.provide(GrantResolver.layer));

/** The internal reads and writes of groups and threads, which other domains share. */
const groupQuery = GroupQuery.layer;
const groupCommand = GroupCommand.layer;
const threadQuery = ThreadQuery.layer.pipe(
  Layer.provide(Layer.mergeAll(groupQuery, ThreadActivityResolvers.layer(activityResolvers))),
);
const threadCommand = ThreadCommand.layer.pipe(Layer.provide(threadQuery));
const turnCommand = TurnCommand.layer.pipe(
  Layer.provide(Layer.mergeAll(threadQuery, threadCommand)),
);
const turnQuery = TurnQuery.layer;
const notificationSource = NotificationSource.layer.pipe(Layer.provide(threadQuery));
const threadReading = ThreadReading.layer;
/**
 * One journal follower per workspace runtime, shared by its change-feed subscribers and by those
 * following a turn's log, who stop when their access changes.
 */
const changeFeedSource = ChangeFeedSource.layer();
const changeFeedApplication = ChangeFeedApplication.layer.pipe(
  Layer.provide(Layer.mergeAll(changeFeedSource, GrantResolver.layer)),
);

/**
 * Application operations, sharing one journal and one authorization check. These
 * are what hosts and protocols call; stores and the journal stay internal.
 */
const operations = Layer.mergeAll(
  WorkspaceSettingsApplication.layer.pipe(
    Layer.provide(Layer.mergeAll(MemberApplication.layer, AssignmentApplication.layer)),
  ),
  MemberApplication.layer,
  InvitationApplication.layer,
  AssignmentApplication.layer,
  OwnershipApplication.layer,
  NotificationApplication.layer,
  changeFeedApplication,
  GroupApplication.layer,
  GroupMembershipApplication.layer,
  GroupFollowApplication.layer,
  ThreadApplication.layer,
  ReadStateApplication.layer,
  ThreadMessageApplication.layer,
  ThreadParticipationApplication.layer,
  SignalApplication.layer,
  ConnectionApplication.layer,
  EnvironmentApplication.layer,
  AgentApplication.layer.pipe(Layer.provide(MemberApplication.layer)),
  TurnApplication.layer,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Delegation.layer,
      groupQuery,
      groupCommand,
      threadQuery,
      threadCommand,
      notificationSource,
      threadReading,
      turnCommand,
      turnQuery,
      changeFeedSource,
    ),
  ),
);

/**
 * What runs outside requests: the domains' background processes, and turn execution, which a
 * host's runner drives for the turns agents accepted. Neither is an operation an actor calls.
 */
const background = Layer.mergeAll(
  BackgroundRuns.layer(processes).pipe(Layer.provide(turnCommand)),
  TurnExecution.layer,
).pipe(Layer.provide(Layer.mergeAll(threadQuery, threadCommand, turnCommand)));

/**
 * Complete core for one workspace: application operations, background runs, and turn execution over the
 * journal, authorization, and the permission catalog.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(operations, background).pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
  Layer.provideMerge(PermissionCatalog.layer(permissions)),
);

/**
 * Host-provided dependencies derived from the layer: workspace-bound stores, the checkpoint
 * store, cryptography, the workspace's signals, and its background wakes. Adding a required store changes this type
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
