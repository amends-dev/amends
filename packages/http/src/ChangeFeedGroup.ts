/**
 * The `changeFeed` endpoint group: the live stream of a workspace's commits and signals, as
 * server-sent events of core's `ChangeFeed.Message`. Its one endpoint calls
 * `ChangeFeedService.watch`, for any active member, resuming after the cursor the client gives; a
 * cursor the server cannot resume from starts delivery at the head with a reset. A caller at the
 * server's limit of open streams gets `ApiErrors.TooManyStreams`, and a stream that cannot go on
 * ends with `ChangeFeed.Unavailable`, after which the client reconnects with its last cursor.
 * `ChangeFeedHandlers` implements it.
 *
 * @since 0.1.0
 */
import { ChangeFeed } from "@amends-dev/core/change-feed";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * Live workspace changes the caller may see. Ready opens every subscription and says whether to
 * refresh; each commit carries a cursor that resumes after it, and signals such as typing arrive
 * between them.
 *
 * @category models
 * @since 0.1.0
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
