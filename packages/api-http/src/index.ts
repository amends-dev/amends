/**
 * The HTTP contract of amends, shared by `@amends-dev/server-http`, which implements it, and the
 * clients that call it. `Api` is the whole contract and each `XGroup` one set of endpoints;
 * `Authentication` is the bearer middleware that provides `Principal` and `Credential` and fails
 * with `Unauthorized`; and `ApiErrors` gives each outcome an endpoint answers with its status.
 * Core's wire schemas are re-exported beside them, so a typed client decodes responses without
 * importing core.
 *
 * @since 0.1.0
 */
export {
  /**
   * The accounts behind a workspace's people: its human members and the recipients of its
   * invitations. Only someone who manages invitations, which go to an address, may read them.
   *
   * @category models
   * @since 0.1.0
   */
  AccountsGroup,
} from "./AccountsGroup.ts";
export {
  /**
   * The workspace's agents, each a member working on the harness, model, and sandbox its
   * connections give. Every member may read them; administrators add, configure, and rename them.
   * An agent's role and removal are its membership's, through `members` and `assignments`.
   *
   * @category models
   * @since 0.1.0
   */
  AgentsGroup,
} from "./AgentsGroup.ts";
export {
  /**
   * The public HTTP contract. Servers implement its groups; clients are generated from it.
   *
   * @category models
   * @since 0.1.0
   */
  Api,
} from "./Api.ts";
export {
  /**
   * Live workspace changes the caller may see. Ready opens every subscription and says whether to
   * refresh; each commit carries a cursor that resumes after it, and signals such as typing arrive
   * between them.
   *
   * @category models
   * @since 0.1.0
   */
  ChangeFeedGroup,
} from "./ChangeFeedGroup.ts";
export {
  /**
   * What external systems send a channel. No session authenticates these requests: the channel's
   * transport verifies each as its system signs it, and rejects what it cannot. The answer is what
   * the transport says the system expects, or nothing.
   *
   * @category models
   * @since 0.1.0
   */
  ChannelEventsGroup,
  /**
   * Channels: a connection's external conversations, which become threads in one group, as tasks in
   * triage when the channel opens tasks. A member creates a channel over a connection they may use
   * into a group they belong to, lists and reads the channels they may read, redirects one's new
   * conversations to another group, or removes it. A thread that came through a channel has a
   * binding, the conversation it came from.
   *
   * @category models
   * @since 0.1.0
   */
  ChannelsGroup,
} from "./ChannelsGroup.ts";
export {
  /**
   * The workspace's connections to the integrations this host installs, and the integrations
   * themselves. Every member may read them; administrators add, manage, and check them. A key goes
   * in with its connection or in place of its key, and never comes back out.
   *
   * @category models
   * @since 0.1.0
   */
  ConnectionsGroup,
} from "./ConnectionsGroup.ts";
export {
  /**
   * Bearer authentication. Hosts implement it by resolving the credential to an
   * identity; clients implement it by attaching the credential. The contract
   * says nothing about how tokens are issued.
   *
   * @category services
   * @since 0.1.0
   */
  Authentication,
  /**
   * The credential the request presented, supplied by middleware with the principal, for an
   * endpoint that acts on the credential itself, as signing out does.
   *
   * @category services
   * @since 0.1.0
   */
  Credential,
  /**
   * The authenticated human or agent, supplied by middleware for each request.
   *
   * @category services
   * @since 0.1.0
   */
  Principal,
  /**
   * The request's credential authenticates nobody the host honors: a missing, malformed, unknown,
   * or expired token, or a session no account holds; 401, with why.
   *
   * @category errors
   * @since 0.1.0
   */
  Unauthorized,
} from "./Authentication.ts";
/**
 * The contract's error namespace: each gateway and core outcome with its HTTP status, and the
 * lists of them endpoints declare.
 *
 * @since 0.1.0
 */
export * as ApiErrors from "./ApiErrors.ts";
export {
  /**
   * The caller's groups, their rosters, following, and catching up. Every read requires current
   * membership of the group; a group the caller does not belong to answers as missing. Public groups
   * can also be browsed and joined; their threads stay with their members.
   *
   * @category models
   * @since 0.1.0
   */
  GroupsGroup,
} from "./GroupsGroup.ts";
export {
  /**
   * Invitation listing, issuance, acceptance, and revocation within one workspace.
   *
   * @category models
   * @since 0.1.0
   */
  InvitationsGroup,
} from "./InvitationsGroup.ts";
export {
  /**
   * The authenticated identity: who they are, what they can reach across workspaces, and signing
   * out. Only a person has an account; a session no account holds is not honored.
   *
   * @category models
   * @since 0.1.0
   */
  MeGroup,
} from "./MeGroup.ts";
export {
  /**
   * Membership reads and removal, authorized by core for the principal's membership, and the
   * caller choosing what people in the workspace call them.
   *
   * @category models
   * @since 0.1.0
   */
  MembersGroup,
} from "./MembersGroup.ts";
export {
  /**
   * The authenticated member's inbox within one workspace: reading it newest first, with each
   * notification's source while they may read it, counting what is pending, and marking
   * notifications seen. Reading neither
   * marks a notification seen nor grants access to its source.
   *
   * @category models
   * @since 0.1.0
   */
  NotificationsGroup,
} from "./NotificationsGroup.ts";
export {
  /**
   * Signing in: the ways this host offers, then an email code to request and exchange for a session.
   * No credential is needed yet.
   *
   * @category models
   * @since 0.1.0
   */
  SessionGroup,
} from "./SessionGroup.ts";
export {
  /**
   * Tasks: the work a thread tracks, with a status, priority, and assignee. A task is created with
   * its thread through the threads group's start, or in a conversation here; its title is the
   * thread's and its description the thread's opening message. Reading a task is reading its thread:
   * missing and unreadable ones, and threads without a task, answer alike.
   *
   * @category models
   * @since 0.1.0
   */
  TasksGroup,
} from "./TasksGroup.ts";
export {
  /**
   * Conversations: a group's threads, starting them, as tasks or not, and renaming them, their
   * timelines and participants, replying, editing and deleting messages, saying one is typing,
   * following, and read positions.
   * Reading a thread requires current membership of its group and creates no participation; missing
   * and unreadable threads answer alike.
   *
   * @category models
   * @since 0.1.0
   */
  ThreadsGroup,
} from "./ThreadsGroup.ts";
export {
  /**
   * Agents' turns: each agent's work on what was asked of it in a thread, which a reader of the
   * thread may follow, with its log, as a stream of its items and the step being written until the
   * turn ends. Whoever may direct the agent may stop an active turn, or retry one that failed or
   * stopped; each turn says whether the caller may do either now. The workspace's active turns are
   * those in threads the caller may open.
   *
   * @category models
   * @since 0.1.0
   */
  TurnsGroup,
} from "./TurnsGroup.ts";
export {
  /**
   * Workspace creation, settings and renaming, the member-management view, and ownership. Creation
   * entitlement checks belong to the host.
   *
   * @category models
   * @since 0.1.0
   */
  WorkspacesGroup,
} from "./WorkspacesGroup.ts";

// Shared wire schemas for typed clients; implementations stay in core.
export {
  /**
   * A human's, an agent's, or a contact's stable identity, independent of any workspace.
   *
   * @category models
   * @since 0.1.0
   */
  Identity,
} from "@amends-dev/core/identity";
export {
  /**
   * The messages a reader receives, the cursor it resumes from, and the options it watches with.
   *
   * @category models
   * @since 0.1.0
   */
  ChangeFeed,
} from "@amends-dev/core/change-feed";
export {
  /**
   * The kinds of signal, and who on the change feed may receive each.
   *
   * @category models
   * @since 0.1.0
   */
  Signal,
} from "@amends-dev/core/signal";
export {
  /**
   * The workspace's record, its name rules, and the input that creates one.
   *
   * @category models
   * @since 0.1.0
   */
  Workspace,
  /**
   * What a workspace's settings show and change.
   *
   * @category models
   * @since 0.1.0
   */
  WorkspaceSettings,
  /**
   * Who owns the workspace, and the input and record of a transfer.
   *
   * @category models
   * @since 0.1.0
   */
  Ownership,
  /**
   * A membership's record, its name rules, and the audience of one member.
   *
   * @category models
   * @since 0.1.0
   */
  Member,
  /**
   * An invitation's record: its issuance, the state it settles into, and the input that issues one.
   *
   * @category models
   * @since 0.1.0
   */
  Invitation,
} from "@amends-dev/core/workspace";
export {
  /**
   * An assignment's record and source, the inputs that assign and change roles, and the views of a
   * member's access.
   *
   * @category models
   * @since 0.1.0
   */
  Assignment,
  /**
   * What a grant covers: a whole workspace or one exact target.
   *
   * @category models
   * @since 0.1.0
   */
  Scope,
} from "@amends-dev/core/authorization";
export {
  /**
   * A group's record, team or direct, the views lists show of it, and the inputs that create and
   * rename one.
   *
   * @category models
   * @since 0.1.0
   */
  Group,
  /**
   * One member's admission to one group, and the inputs that add, remove, and leave.
   *
   * @category models
   * @since 0.1.0
   */
  GroupMembership,
} from "@amends-dev/core/group";
export {
  /**
   * A thread's record, the views lists show of it, and the inputs that start and rename one.
   *
   * @category models
   * @since 0.1.0
   */
  Thread,
  /**
   * A message: markdown written by a member or a contact, and whom it addresses.
   *
   * @category models
   * @since 0.1.0
   */
  ThreadMessage,
  /**
   * Who takes part in a thread, and from where in it.
   *
   * @category models
   * @since 0.1.0
   */
  ThreadParticipation,
  /**
   * The closed set of timeline items, for protocols that encode timelines.
   *
   * @category models
   * @since 0.1.0
   */
  ThreadTimeline,
} from "@amends-dev/core/thread";
export {
  /**
   * A task's record, its status and priority, its changes, and the inputs that create and change one.
   *
   * @category models
   * @since 0.1.0
   */
  Task,
} from "@amends-dev/core/task";
export {
  /**
   * A notification's record: its source, its recipient, and where it stands, and how thread activity
   * generates one.
   *
   * @category models
   * @since 0.1.0
   */
  Notification,
  /**
   * What reading the inbox takes and returns: a page's options, and each notification with its
   * source.
   *
   * @category models
   * @since 0.1.0
   */
  NotificationInbox,
} from "@amends-dev/core/notification";
export {
  /**
   * A connection's record, the views readers see of it and of the host's integrations, and the
   * inputs of the operations on it.
   *
   * @category models
   * @since 0.1.0
   */
  Connection,
} from "@amends-dev/core/connection";
export {
  /**
   * An agent's record, the parts of its setup, the inputs that create, configure, and rename one,
   * and the view readers see.
   *
   * @category models
   * @since 0.1.0
   */
  Agent,
} from "@amends-dev/core/agent";
export {
  /**
   * A turn's record, what a reader sees of it, and the items and messages by which a reader follows
   * its session log.
   *
   * @category models
   * @since 0.1.0
   */
  Turn,
} from "@amends-dev/core/turn";
export {
  /**
   * A channel's record, name, and the inputs that create and redirect one.
   *
   * @category models
   * @since 0.1.0
   */
  Channel,
  /**
   * A thread's binding to the external conversation it came from.
   *
   * @category models
   * @since 0.1.0
   */
  ChannelBinding,
} from "@amends-dev/core/channel";
