import { ChangeFeed } from "@amends/core/change-feed";
import { Thread } from "@amends/core/thread";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/**
 * Live workspace changes the caller may see. Ready opens every subscription and says whether to
 * refresh; each commit carries a cursor that resumes after it, and signals such as typing arrive
 * between them. Typing reports that the caller is composing a message in a thread.
 */
export class ChangesGroup extends HttpApiGroup.make("changes")
  .add(
    HttpApiEndpoint.get("watch", "/workspaces/:workspaceId/changes", {
      params: { workspaceId: Workspace.Id },
      query: {
        after: Schema.optionalKey(ChangeFeed.Cursor).annotate({
          description: "Resume after the commit that carried this cursor.",
        }),
      },
      success: HttpApiSchema.StreamSse({ data: ChangeFeed.Message, error: ChangeFeed.Unavailable }),
      error: [...ApiErrors.member, ChangeFeed.Unavailable.pipe(HttpApiSchema.status(503))],
    }),
  )
  .add(
    HttpApiEndpoint.post("typing", "/workspaces/:workspaceId/threads/:threadId/typing", {
      params: { workspaceId: Workspace.Id, threadId: Thread.Id },
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ApiErrors.TypingThreadNotFound],
    }),
  )
  .middleware(Authentication) {}
