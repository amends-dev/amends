/**
 * Invalidation keys for credential-scoped reads. Each read registers one key; writes and the
 * workspace change feed invalidate them, and the registry refreshes whichever reads are mounted.
 */
export type WorkspaceResource =
  | "settings"
  | "ownership"
  | "members"
  | "invitations"
  | "groups"
  | "public-groups"
  | "inbox"
  | "permissions";
export const workspaceResources: ReadonlyArray<WorkspaceResource> = [
  "settings",
  "ownership",
  "members",
  "invitations",
  "groups",
  "public-groups",
  "inbox",
  "permissions",
];
/** Everything the signed-in identity can reach, across workspaces. */
export const directoryKey = "directory";
export const workspaceKey = (workspaceId: string, resource: WorkspaceResource) =>
  `workspace/${workspaceId}/${resource}`;

/**
 * Reads of one group or thread: a group's stream or roster, or a thread's timeline or participants. Each registers under its
 * collection and its own ID, so one can be invalidated alone and a collection all at once.
 */
export type WorkspaceCollection = "streams" | "timelines" | "rosters" | "participants";
export const workspaceCollections: ReadonlyArray<WorkspaceCollection> = [
  "streams",
  "timelines",
  "rosters",
  "participants",
];
export const collectionKey = (workspaceId: string, collection: WorkspaceCollection) =>
  `workspace/${workspaceId}/${collection}`;
/** The key a read of one item registers. */
export const itemKeys = (workspaceId: string, collection: WorkspaceCollection, id: string) => ({
  [collectionKey(workspaceId, collection)]: [id],
});
/** The key that invalidates one item's read alone. */
export const itemKey = (workspaceId: string, collection: WorkspaceCollection, id: string) =>
  `${collectionKey(workspaceId, collection)}:${id}`;
