import type { Member, Workspace } from "@amends/core/workspace";
import type { Notification } from "@amends/core/notification";

/** Every entry is one invalidation key, scoped to the complete resource identity. */
export const keys = {
  workspace: (workspaceId: Workspace.Id) => JSON.stringify(["workspace", workspaceId]),
  ownership: (workspaceId: Workspace.Id) => JSON.stringify(["ownership", workspaceId]),
  access: (workspaceId: Workspace.Id) => JSON.stringify(["access", workspaceId]),
  me: { workspaces: JSON.stringify(["me", "workspaces"]) },
  members: {
    list: (workspaceId: Workspace.Id) => JSON.stringify(["members", "list", workspaceId]),
    get: (workspaceId: Workspace.Id, memberId: Member.Id) =>
      JSON.stringify(["members", "get", workspaceId, memberId]),
  },
  invitations: {
    list: (workspaceId: Workspace.Id) => JSON.stringify(["invitations", "list", workspaceId]),
  },
  notifications: {
    all: (workspaceId: Workspace.Id) => JSON.stringify(["notifications", workspaceId]),
    list: (workspaceId: Workspace.Id) => JSON.stringify(["notifications", "list", workspaceId]),
    get: (workspaceId: Workspace.Id, notificationId: Notification.Id) =>
      JSON.stringify(["notifications", "get", workspaceId, notificationId]),
  },
};
