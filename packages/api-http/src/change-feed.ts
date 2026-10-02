import { ChangeFeed } from "@amends/core/change-feed";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/**
 * Live workspace changes the caller may see. Ready opens every subscription and says whether to
 * refresh; each commit carries a cursor that resumes after it, and signals such as typing arrive
 * between them.
 */
export class ChangeFeedGroup extends HttpApiGroup.make("changeFeed")
  .add(
    HttpApiEndpoint.get("watch", "/workspaces/:workspaceId/changes", {
      params: { workspaceId: Workspace.Id },
      query: {
        after: Schema.optionalKey(ChangeFeed.Cursor).annotate({
          description: "Resume after the commit that carried this cursor.",
        }),
      },
      success: HttpApiSchema.StreamSse({ data: ChangeFeed.Message, error: ChangeFeed.Unavailable }),
      error: [
        ...ApiErrors.member,
        ChangeFeed.Unavailable.pipe(HttpApiSchema.status(503)),
        ApiErrors.TooManyStreams,
      ],
    }),
  )
  .middleware(Authentication) {}
