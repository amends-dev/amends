import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";
export const workspaces = () =>
  ApiClient.query("me", "workspaces", { reactivityKeys: [keys.me.workspaces] });
export * as Me from "./me.ts";
