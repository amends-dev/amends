/**
 * The outcome `WorkspaceSettingsService` reports that a caller can act on. It is a schema, so
 * protocols carry it to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Workspace from "../Workspace.ts";

/**
 * The workspace's name is no longer the one the renamer expected: someone renamed it meanwhile,
 * and nothing was recorded.
 */
export class Changed extends Schema.TaggedError<Changed>()("WorkspaceSettings.Changed", {
  workspaceId: Workspace.Id,
}) {}
