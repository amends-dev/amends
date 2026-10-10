export { AgentsGroup } from "./agents.ts";
export { Api } from "./api.ts";
export { ChangeFeedGroup } from "./change-feed.ts";
export { ChannelEventsGroup, ChannelsGroup } from "./channels.ts";
export { ConnectionsGroup } from "./connections.ts";
export { Authentication, Principal, Unauthorized } from "./authentication.ts";
export { ApiErrors } from "./errors.ts";
export { GroupsGroup } from "./groups.ts";
export { InvitationsGroup } from "./invitations.ts";
export { MeGroup } from "./me.ts";
export { MembersGroup } from "./members.ts";
export { NotificationsGroup } from "./notifications.ts";
export { SessionGroup } from "./session.ts";
export { TasksGroup } from "./tasks.ts";
export { ThreadsGroup } from "./threads.ts";
export { TurnsGroup } from "./turns.ts";
export { WorkspacesGroup } from "./workspaces.ts";

// Shared wire schemas for typed clients; implementations stay in core.
export { Identity } from "@amends-dev/core/identity";
export { ChangeFeed } from "@amends-dev/core/change-feed";
export { Signal } from "@amends-dev/core/signal";
export {
  Workspace,
  WorkspaceSettings,
  Ownership,
  Member,
  Invitation,
} from "@amends-dev/core/workspace";
export { Assignment, Scope } from "@amends-dev/core/authorization";
export { Group, GroupMembership } from "@amends-dev/core/group";
export {
  Thread,
  ThreadMessage,
  ThreadParticipation,
  ThreadTimeline,
} from "@amends-dev/core/thread";
export { Task } from "@amends-dev/core/task";
export { Notification, NotificationInbox } from "@amends-dev/core/notification";
export { Connection } from "@amends-dev/core/connection";
export { Agent } from "@amends-dev/core/agent";
export { Turn } from "@amends-dev/core/turn";
export { Channel, ChannelBinding } from "@amends-dev/core/channel";
