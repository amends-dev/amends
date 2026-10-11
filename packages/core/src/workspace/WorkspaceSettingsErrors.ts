import { Schema } from "effect";
import * as Workspace from "./Workspace.ts";
export class Changed extends Schema.TaggedError<Changed>()("WorkspaceSettings.Changed", {
  workspaceId: Workspace.Id,
}) {}
