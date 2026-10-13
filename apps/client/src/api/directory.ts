import type { ApiClient } from "./client.ts"
import { directoryKey } from "./keys.ts"

/** Session validation and the workspace picker share this credential-scoped read. */
export const directoryQuery = (client: ApiClient) =>
  client.query("me", "workspaces", { reactivityKeys: [directoryKey] })
