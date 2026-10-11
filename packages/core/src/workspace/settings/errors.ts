import { Schema } from "effect";
import * as Workspace from "../workspace.ts";
export class Changed extends Schema.TaggedError<Changed>()("WorkspaceSettings.Changed", {
  workspaceId: Workspace.Id,
}) {}
