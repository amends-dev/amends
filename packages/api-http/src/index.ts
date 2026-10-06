export { AgentsGroup } from "./agents.ts";
export { AgentsV2Group } from "./agents-v2.ts";
export { Api } from "./api.ts";
export { ChangeFeedGroup } from "./change-feed.ts";
export { ConnectionsGroup } from "./connections.ts";
export { ConnectionsV2Group } from "./connections-v2.ts";
export { EnvironmentsGroup } from "./environments.ts";
export { Authentication, Principal, Unauthorized } from "./authentication.ts";
export { ApiErrors } from "./errors.ts";
export { GroupsGroup } from "./groups.ts";
export { InvitationsGroup } from "./invitations.ts";
export { MeGroup } from "./me.ts";
export { MembersGroup } from "./members.ts";
export { NotificationsGroup } from "./notifications.ts";
export { SessionGroup } from "./session.ts";
export { ThreadsGroup } from "./threads.ts";
export { TurnsGroup } from "./turns.ts";
export { WorkspacesGroup } from "./workspaces.ts";

// Shared wire schemas for typed clients; implementations stay in core.
export { Identity } from "@amends/core/identity";
export { ChangeFeed } from "@amends/core/change-feed";
export { Signal } from "@amends/core/signal";
export {
  Workspace,
  WorkspaceSettings,
  Ownership,
  Member,
  Invitation,
} from "@amends/core/workspace";
export { Assignment, Scope } from "@amends/core/authorization";
export { Group, GroupMembership } from "@amends/core/group";
export { Thread, ThreadMessage, ThreadParticipation, ThreadTimeline } from "@amends/core/thread";
export { Notification, NotificationInbox } from "@amends/core/notification";
export { Connection } from "@amends/core/connection";
export { ConnectionV2 } from "@amends/core/connection-v2";
export { ConnectionImplementation } from "@amends/connection";
export { Environment, EnvironmentCompatibility } from "@amends/core/environment";
export { Agent } from "@amends/core/agent";
export { AgentV2 } from "@amends/core/agent-v2";
export { Turn } from "@amends/core/turn";
export { HarnessImplementation } from "@amends/harness";
export { SandboxImplementation } from "@amends/sandbox";
