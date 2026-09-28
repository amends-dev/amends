import { Thread } from "@amends/core/thread";
import { Turn } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const turn = { workspaceId: Workspace.Id, turnId: Turn.Id };
const view = Turn.View.annotate({ identifier: "Turn" });

/**
 * Agents' turns: each agent's attempt at the work asked of it on a thread, which a reader of the
 * thread may follow. Whoever may direct the agent may stop an active turn, or retry one that
 * failed or stopped; each turn says whether the caller may do either now.
 */
export class TurnsGroup extends HttpApiGroup.make("turns")
  .add(
    HttpApiEndpoint.get("listByThread", "/threads/:threadId/turns", {
      params: { workspaceId: Workspace.Id, threadId: Thread.Id },
      query: { limit },
      success: Schema.Array(view),
      error: [...ApiErrors.member, ApiErrors.TurnThreadNotFound],
    }),
    HttpApiEndpoint.get("get", "/turns/:turnId", {
      params: turn,
      success: view,
      error: [...ApiErrors.member, ApiErrors.TurnNotFound],
    }),
    HttpApiEndpoint.post("cancel", "/turns/:turnId/cancel", {
      params: turn,
      success: view,
      error: [...ApiErrors.member, ApiErrors.TurnNotFound, ApiErrors.TurnNotActive],
    }),
    HttpApiEndpoint.post("retry", "/turns/:turnId/retry", {
      params: turn,
      headers: ApiErrors.requestKey,
      success: Turn.View.pipe(HttpApiSchema.status(201)).annotate({ identifier: "RetriedTurn" }),
      error: [
        ...ApiErrors.member,
        ApiErrors.TurnNotFound,
        ApiErrors.TurnNotRetryable,
        ApiErrors.RequestReused,
      ],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
