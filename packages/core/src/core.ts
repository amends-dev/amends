import * as AgentPermissions from "./agent/permissions.ts";
import * as AgentProjection from "./agent/projection.ts";
import * as AgentService from "./agent/service.ts";
import * as TurnCommand from "./turn/command.ts";
import * as TurnService from "./turn/service.ts";
import * as TurnJobs from "./turn/jobs.ts";
import type * as TurnStore from "./turn/store.ts";
import type * as Reaction from "./journal/reaction.ts";
import * as TurnExecution from "./turn/execution.ts";
import type * as SessionLogStore from "./turn/session-log-store.ts";
import * as AgentQuery from "./agent/query.ts";
import * as TurnProjection from "./turn/projection.ts";
import * as ConnectionService from "./connection/service.ts";
import * as ConnectionPermissions from "./connection/permissions.ts";
import * as ConnectionProjection from "./connection/projection.ts";
import * as ThreadService from "./thread/ThreadService.ts";
import * as ThreadCommand from "./thread/ThreadCommand.ts";
import * as GroupCommand from "./group/command.ts";
import * as ThreadQuery from "./thread/ThreadQuery.ts";
import * as ThreadMessageService from "./thread/ThreadMessageService.ts";
import * as ThreadMessagePermissions from "./thread/ThreadMessagePermissions.ts";
import * as ThreadParticipationService from "./thread/ThreadParticipationService.ts";
import * as ThreadParticipationPermissions from "./thread/ThreadParticipationPermissions.ts";
import * as ThreadActivityResolvers from "./thread/ThreadActivityResolvers.ts";
import * as ThreadMessageTimeline from "./thread/ThreadMessageTimeline.ts";
import * as ThreadParticipationTimeline from "./thread/ThreadParticipationTimeline.ts";
import * as ThreadTitleTimeline from "./thread/ThreadTitleTimeline.ts";
import * as TurnTimeline from "./turn/timeline.ts";
import * as ThreadPermissions from "./thread/ThreadPermissions.ts";
import * as ThreadProjection from "./thread/ThreadProjection.ts";
import * as ThreadParticipationProjection from "./thread/ThreadParticipationProjection.ts";
import * as ThreadMessageProjection from "./thread/ThreadMessageProjection.ts";
import * as ThreadActivityProjection from "./thread/ThreadActivityProjection.ts";
import * as TaskCommand from "./task/TaskCommand.ts";
import * as TaskPermissions from "./task/TaskPermissions.ts";
import * as TaskProjection from "./task/TaskProjection.ts";
import * as TaskService from "./task/TaskService.ts";
import * as TaskTimeline from "./task/TaskTimeline.ts";
import * as ChannelIntake from "./channel/ChannelIntake.ts";
import * as ChannelPermissions from "./channel/ChannelPermissions.ts";
import * as ChannelProjection from "./channel/ChannelProjection.ts";
import * as ChannelQuery from "./channel/ChannelQuery.ts";
import * as ChannelService from "./channel/ChannelService.ts";
import * as DeliveryExecution from "./channel/DeliveryExecution.ts";
import * as DeliveryJobs from "./channel/DeliveryJobs.ts";
import * as DeliveryProjection from "./channel/DeliveryProjection.ts";
/**
 * Compose one workspace's core from its domains. Hosts bind storage to a
 * workspace and supply cryptography; a gateway resolves the acting member and
 * runs the application operations.
 */
import { Layer } from "effect";
import * as ChangeFeedService from "./change-feed/service.ts";
import * as ChangeFeedSource from "./change-feed/source.ts";
import * as GroupService from "./group/service.ts";
import * as GroupQuery from "./group/query.ts";
import * as GroupProjection from "./group/projection.ts";
import * as GroupMembershipProjection from "./group/membership/projection.ts";
import * as GroupFollowService from "./group/follow/service.ts";
import * as GroupFollowProjection from "./group/follow/projection.ts";
import * as ReadStateService from "./read-state/service.ts";
import * as ReadStateCommand from "./read-state/command.ts";
import * as GroupMembershipService from "./group/membership/service.ts";
import * as GroupMembershipPermissions from "./group/membership/permissions.ts";
import * as GroupPermissions from "./group/permissions.ts";
import * as AssignmentProjection from "./authorization/assignment/projection.ts";
import * as AssignmentService from "./authorization/assignment/service.ts";
import * as AssignmentCommand from "./authorization/assignment/command.ts";
import * as AssignmentPermissions from "./authorization/assignment/permissions.ts";
import * as Delegation from "./authorization/delegation.ts";
import * as Authorization from "./authorization/authorization.ts";
import * as GrantResolver from "./authorization/grant-resolver.ts";
import * as PermissionCatalog from "./authorization/permission-catalog.ts";
import * as RoleProjection from "./authorization/role/projection.ts";
import * as Journal from "./journal/journal.ts";
import * as Log from "./journal/log.ts";
import * as NotificationService from "./notification/service.ts";
import * as NotificationProjection from "./notification/projection.ts";
import * as InvitationService from "./workspace/invitation/service.ts";
import * as InvitationPermissions from "./workspace/invitation/permissions.ts";
import * as InvitationProjection from "./workspace/invitation/projection.ts";
import * as MemberCommand from "./workspace/member/command.ts";
import * as MemberService from "./workspace/member/service.ts";
import * as MemberPermissions from "./workspace/member/permissions.ts";
import * as MemberProjection from "./workspace/member/projection.ts";
import * as WorkspaceProjection from "./workspace/projection.ts";
import * as OwnershipService from "./workspace/ownership/service.ts";
import * as OwnershipPermissions from "./workspace/ownership/permissions.ts";
import * as WorkspaceSettingsService from "./workspace/settings/service.ts";
import * as WorkspaceSettingsPermissions from "./workspace/settings/permissions.ts";

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
  TaskProjection.definition,
  ChannelProjection.definition,
  DeliveryProjection.definition,
  NotificationProjection.definition,
  ConnectionProjection.definition,
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
  ThreadPermissions.Rename,
  ThreadMessagePermissions.Publish,
  ThreadMessagePermissions.Moderate,
  ThreadParticipationPermissions.Follow,
  TaskPermissions.Create,
  TaskPermissions.Update,
  AgentPermissions.Use,
  ConnectionPermissions.Create,
  ConnectionPermissions.Read,
  ConnectionPermissions.Manage,
  ConnectionPermissions.Use,
  AgentPermissions.Create,
  AgentPermissions.Read,
  AgentPermissions.Configure,
  ChannelPermissions.Create,
  ChannelPermissions.Read,
  ChannelPermissions.Manage,
];

/**
 * How each kind of thread activity appears in a timeline, one resolver per owning domain. A domain
 * that records a new kind adds its resolver here, and its timeline item schema to `ThreadTimeline`.
 */
const activityResolvers = [
  ThreadMessageTimeline.resolver,
  ThreadParticipationTimeline.resolver,
  ThreadTitleTimeline.resolver,
  TurnTimeline.resolver,
  TaskTimeline.resolver,
] as const;

/**
 * The workspace journal's log. A workspace that was never created has no batch in it, which
 * hosts can check without booting the workspace.
 */
export const journalLog = Log.Id.make("journal");

/**
 * The domain journal and its log, over host storage. A commit that publishes a fact that changes
 * an agent's work in a thread requests that agent's turn job in the same commit, and one that
 * tells a contact something requests the thread's delivery job.
 */
const reactions: ReadonlyArray<
  Reaction.Definition<TurnJobs.TurnJobs | TurnStore.TurnStore | DeliveryJobs.DeliveryJobs>
> = [...TurnJobs.reactions, ...DeliveryJobs.reactions];
const journal = Journal.layer({ logId: journalLog, projections, reactions }).pipe(
  Layer.provideMerge(Log.layer),
);

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
const taskCommand = TaskCommand.layer.pipe(
  Layer.provide(Layer.mergeAll(threadQuery, threadCommand, turnCommand)),
);
const channelQuery = ChannelQuery.layer;
const readStateCommand = ReadStateCommand.layer;
const memberCommand = MemberCommand.layer.pipe(Layer.provide(AssignmentCommand.layer));
/**
 * One journal follower per workspace runtime, shared by its change-feed subscribers and by those
 * following a turn's log, who stop when their access changes.
 */
const changeFeedSource = ChangeFeedSource.layer();
const changeFeedService = ChangeFeedService.layer.pipe(
  Layer.provide(Layer.mergeAll(changeFeedSource, GrantResolver.layer)),
);

/**
 * Application operations, sharing one journal and one authorization check. These
 * are what hosts and protocols call; stores and the journal stay internal.
 */
const operations = Layer.mergeAll(
  WorkspaceSettingsService.layer.pipe(
    Layer.provide(Layer.mergeAll(MemberService.layer, AssignmentService.layer)),
  ),
  MemberService.layer,
  InvitationService.layer,
  AssignmentService.layer,
  OwnershipService.layer,
  NotificationService.layer,
  changeFeedService,
  GroupService.layer,
  GroupMembershipService.layer,
  GroupFollowService.layer,
  ThreadService.layer,
  ReadStateService.layer,
  ThreadMessageService.layer,
  ThreadParticipationService.layer,
  TaskService.layer,
  ChannelService.layer,
  ConnectionService.layer,
  AgentService.layer,
  TurnService.layer,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Delegation.layer,
      AssignmentCommand.layer,
      memberCommand,
      groupQuery,
      groupCommand,
      threadQuery,
      threadCommand,
      readStateCommand,
      turnCommand,
      taskCommand,
      channelQuery,
      changeFeedSource,
    ),
  ),
);

/**
 * What jobs and hosts call outside requests, as no actor: turn execution, which an agent's turn job
 * drives in a thread; intake, which a host calls for what its channels receive; and delivery
 * execution, which a thread's delivery job drives. None is an operation an actor calls.
 */
const jobServices = Layer.mergeAll(
  TurnExecution.layer,
  ChannelIntake.layer,
  DeliveryExecution.layer,
).pipe(
  Layer.provide(
    Layer.mergeAll(
      threadQuery,
      threadCommand,
      turnCommand,
      taskCommand,
      channelQuery,
      AgentQuery.layer,
    ),
  ),
);

/**
 * Complete core for one workspace: application operations and what jobs call, over the journal,
 * authorization, and the permission catalog.
 *
 * @category layers
 */
export const layer = Layer.mergeAll(operations, jobServices).pipe(
  Layer.provideMerge(Layer.mergeAll(journal, authorization)),
  Layer.provideMerge(PermissionCatalog.layer(permissions)),
);

/**
 * Host-provided dependencies derived from the layer: workspace-bound stores, the checkpoint
 * store, cryptography, the workspace's signals, the integrations it installs, and its turn jobs.
 * Adding a required store changes this type and makes incomplete host compositions fail type
 * checking.
 *
 * @category models
 */
export type HostServices = Layer.Services<typeof layer>;

/**
 * The services a host runs for an actor. Programs a gateway
 * accepts may require only these, so they cannot bypass the membership and
 * permission checks each operation performs.
 *
 * @category models
 */
export type Operations = Layer.Success<typeof operations>;

/**
 * The services a host's jobs call: what they ask of the workspace, and the session logs a turn's
 * job writes, which take part in no commit. They act as the agent, the contact, or the product and
 * check no actor's permissions, so only jobs a host trusts run them, and intake for what the host's
 * channels received, never a protocol's handlers for an actor.
 *
 * @category models
 */
export type JobServices = Layer.Success<typeof jobServices> | SessionLogStore.SessionLogStore;
