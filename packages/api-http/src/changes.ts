import { ChangeFeed } from "@amends/core/change-feed";
import { Workspace } from "@amends/core/workspace";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/** Live workspace changes. Ready marks an established subscription; there is no replay cursor. */
export class ChangesGroup extends HttpApiGroup.make("changes")
  .add(
    HttpApiEndpoint.get("watch", "/workspaces/:workspaceId/changes", {
      params: { workspaceId: Workspace.Id },
      success: HttpApiSchema.StreamSse({ data: ChangeFeed.Message, error: ChangeFeed.Unavailable }),
      error: [...ApiErrors.member, ChangeFeed.Unavailable.pipe(HttpApiSchema.status(503))],
    }),
  )
  .middleware(Authentication) {}
