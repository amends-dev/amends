export { AccountsGroup } from "./AccountsGroup.ts";
export { AgentsGroup } from "./AgentsGroup.ts";
export { Api } from "./Api.ts";
export { ChangeFeedGroup } from "./ChangeFeedGroup.ts";
export { ChannelEventsGroup, ChannelsGroup } from "./ChannelsGroup.ts";
export { ConnectionsGroup } from "./ConnectionsGroup.ts";
export { Authentication, Credential, Principal, Unauthorized } from "./Authentication.ts";
export * as ApiErrors from "./ApiErrors.ts";
export { GroupsGroup } from "./GroupsGroup.ts";
export { InvitationsGroup } from "./InvitationsGroup.ts";
export { MeGroup } from "./MeGroup.ts";
export { MembersGroup } from "./MembersGroup.ts";
export { NotificationsGroup } from "./NotificationsGroup.ts";
export { SessionGroup } from "./SessionGroup.ts";
export { TasksGroup } from "./TasksGroup.ts";
export { ThreadsGroup } from "./ThreadsGroup.ts";
export { TurnsGroup } from "./TurnsGroup.ts";
export { WorkspacesGroup } from "./WorkspacesGroup.ts";

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
