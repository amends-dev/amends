/**
 * Invalidation keys for credential-scoped reads. Each read registers one key; writes and the
 * workspace change feed invalidate them, and the registry refreshes whichever reads are mounted.
 */
export type WorkspaceResource = "settings" | "ownership" | "members" | "invitations";
export const workspaceResources: ReadonlyArray<WorkspaceResource> = [
  "settings",
  "ownership",
  "members",
  "invitations",
];
/** Everything the signed-in identity can reach, across workspaces. */
export const directoryKey = "directory";
export const workspaceKey = (workspaceId: string, resource: WorkspaceResource) =>
  `workspace/${workspaceId}/${resource}`;
