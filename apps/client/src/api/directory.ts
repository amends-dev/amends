import type { ApiClient } from "./client.ts";

/** Session validation and the future workspace picker share this credential-scoped read. */
export const directoryQuery = (client: ApiClient) => client.query("me", "workspaces", {});
