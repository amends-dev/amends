/**
 * One workspace's core, composed from its domains: the application operations an actor calls,
 * what jobs and hosts call outside requests, the journal they all commit through, and
 * authorization over the permission catalog. Hosts bind storage to a workspace and supply
 * cryptography, and a gateway resolves the acting member and runs the operations; `HostServices`,
 * `Operations`, and `JobServices` name what each side provides and may call.
 *
 * @since 0.1.0
 */
import * as AgentPermissions from "./agent/AgentPermissions.ts";
import * as AgentProjection from "./agent/AgentProjection.ts";
import * as AgentService from "./agent/AgentService.ts";
import * as TurnCommand from "./turn/TurnCommand.ts";
import * as TurnService from "./turn/TurnService.ts";
import * as TurnJobs from "./turn/TurnJobs.ts";
import type * as TurnStore from "./turn/TurnStore.ts";
import type * as Reaction from "./journal/Reaction.ts";
import * as TurnExecution from "./turn/TurnExecution.ts";
import type * as SessionLogStore from "./turn/SessionLogStore.ts";
import * as AgentQuery from "./agent/AgentQuery.ts";
import * as TurnProjection from "./turn/TurnProjection.ts";
import * as ConnectionService from "./connection/ConnectionService.ts";
import * as ConnectionPermissions from "./connection/ConnectionPermissions.ts";
import * as ConnectionProjection from "./connection/ConnectionProjection.ts";
import * as ThreadService from "./thread/ThreadService.ts";
import * as ThreadCommand from "./thread/ThreadCommand.ts";
import * as GroupCommand from "./group/GroupCommand.ts";
import * as ThreadQuery from "./thread/ThreadQuery.ts";
import * as ThreadMessageService from "./thread/ThreadMessageService.ts";
import * as ThreadMessagePermissions from "./thread/ThreadMessagePermissions.ts";
import * as ThreadParticipationService from "./thread/ThreadParticipationService.ts";
import * as ThreadParticipationPermissions from "./thread/ThreadParticipationPermissions.ts";
import * as ThreadActivityResolvers from "./thread/ThreadActivityResolvers.ts";
import * as ThreadMessageTimeline from "./thread/ThreadMessageTimeline.ts";
import * as ThreadParticipationTimeline from "./thread/ThreadParticipationTimeline.ts";
import * as ThreadTitleTimeline from "./thread/ThreadTitleTimeline.ts";
import * as TurnTimeline from "./turn/TurnTimeline.ts";
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
import { Layer } from "effect";
import * as ChangeFeedService from "./change-feed/ChangeFeedService.ts";
import * as ChangeFeedSource from "./change-feed/ChangeFeedSource.ts";
import * as GroupService from "./group/GroupService.ts";
import * as GroupQuery from "./group/GroupQuery.ts";
import * as GroupProjection from "./group/GroupProjection.ts";
import * as GroupMembershipProjection from "./group/GroupMembershipProjection.ts";
import * as GroupFollowService from "./group/GroupFollowService.ts";
import * as GroupFollowProjection from "./group/GroupFollowProjection.ts";
import * as ReadStateService from "./read-state/ReadStateService.ts";
import * as GroupMembershipService from "./group/GroupMembershipService.ts";
import * as GroupMembershipPermissions from "./group/GroupMembershipPermissions.ts";
import * as GroupPermissions from "./group/GroupPermissions.ts";
import * as AssignmentProjection from "./authorization/AssignmentProjection.ts";
import * as AssignmentService from "./authorization/AssignmentService.ts";
import * as AssignmentCommand from "./authorization/AssignmentCommand.ts";
import * as AssignmentPermissions from "./authorization/AssignmentPermissions.ts";
import * as Delegation from "./authorization/Delegation.ts";
import * as Authorization from "./authorization/Authorization.ts";
import * as GrantResolver from "./authorization/GrantResolver.ts";
import * as PermissionCatalog from "./authorization/PermissionCatalog.ts";
import * as RoleProjection from "./authorization/RoleProjection.ts";
import * as Journal from "./journal/Journal.ts";
import * as Log from "./journal/Log.ts";
import * as NotificationService from "./notification/NotificationService.ts";
import * as NotificationProjection from "./notification/NotificationProjection.ts";
import * as InvitationService from "./workspace/InvitationService.ts";
import * as InvitationPermissions from "./workspace/InvitationPermissions.ts";
import * as InvitationProjection from "./workspace/InvitationProjection.ts";
import * as MemberCommand from "./workspace/MemberCommand.ts";
import * as MemberService from "./workspace/MemberService.ts";
import * as MemberPermissions from "./workspace/MemberPermissions.ts";
import * as MemberProjection from "./workspace/MemberProjection.ts";
import * as WorkspaceProjection from "./workspace/WorkspaceProjection.ts";
import * as OwnershipService from "./workspace/OwnershipService.ts";
import * as OwnershipPermissions from "./workspace/OwnershipPermissions.ts";
import * as WorkspaceSettingsService from "./workspace/WorkspaceSettingsService.ts";
import * as WorkspaceSettingsPermissions from "./workspace/WorkspaceSettingsPermissions.ts";

/**
 * Projections registered for journal publication, applied in this order. Each derives its records
 * from facts and its own store alone, so any order rebuilds the same read models.
 *
 * @category projections
 * @since 0.1.0
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
 *
 * @category permissions
 * @since 0.1.0
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
 *
 * @category constructors
 * @since 0.1.0
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
 * @since 0.1.0
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
 * @since 0.1.0
 */
export type HostServices = Layer.Services<typeof layer>;

/**
 * The services a host runs for an actor. Programs a gateway
 * accepts may require only these, so they cannot bypass the membership and
 * permission checks each operation performs.
 *
 * @category models
 * @since 0.1.0
 */
export type Operations = Layer.Success<typeof operations>;

/**
 * The services a host's jobs call: what they ask of the workspace, and the session logs a turn's
 * job writes, which take part in no commit. They act as the agent, the contact, or the product and
 * check no actor's permissions, so only jobs a host trusts run them, and intake for what the host's
 * channels received, never a protocol's handlers for an actor.
 *
 * @category models
 * @since 0.1.0
 */
export type JobServices = Layer.Success<typeof jobServices> | SessionLogStore.SessionLogStore;
