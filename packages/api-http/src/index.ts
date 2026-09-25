export { Api } from "./api.ts";
export { ChangesGroup } from "./changes.ts";
export { Authentication, Principal, Unauthorized } from "./authentication.ts";
export { ApiErrors } from "./errors.ts";
export { InvitationsGroup } from "./invitations.ts";
export { MeGroup } from "./me.ts";
export { MembersGroup } from "./members.ts";
export { NotificationsGroup } from "./notifications.ts";
export { SessionGroup } from "./session.ts";
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
