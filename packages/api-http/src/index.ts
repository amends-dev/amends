export { Api } from "./api.ts";
export { ChangesGroup } from "./changes.ts";
export { ConnectionsGroup } from "./connections.ts";
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
export { WorkspacesGroup } from "./workspaces.ts";

// Shared wire schemas for typed clients; implementations stay in core.
export {
  Workspace,
  WorkspaceSettings,
  Ownership,
  Member,
  Invitation,
} from "@amends/core/workspace";
export { Assignment } from "@amends/core/authorization";
export { Group, GroupMembership } from "@amends/core/group";
export { Thread, ThreadMessage, ThreadParticipation, ThreadTimeline } from "@amends/core/thread";
export { Notification, NotificationInbox } from "@amends/core/notification";
export { Connection } from "@amends/core/connection";
export { ConnectionImplementation } from "@amends/connection";
export { Environment, EnvironmentCompatibility } from "@amends/core/environment";
export { HarnessImplementation } from "@amends/harness";
export { SandboxImplementation } from "@amends/sandbox";
