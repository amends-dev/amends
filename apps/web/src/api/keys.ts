import type { Member, Workspace } from "@amends/core/workspace";

/** Every entry is one invalidation key, scoped to the complete resource identity. */
export const keys = {
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
};
