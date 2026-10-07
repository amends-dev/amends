import { Turn } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const turn = { workspaceId: Workspace.Id, turnId: Turn.Id };
const view = Turn.View.annotate({ identifier: "Turn" });

/**
 * Agents' turns: each agent's work on what was asked of it in a thread, which a reader of the
 * thread may follow, with its log, as a stream of its items and the step being written until the
 * turn ends. Whoever may direct the agent may stop an active turn, or retry one that failed or
 * stopped; each turn says whether the caller may do either now. The workspace's active turns are
 * those in threads the caller may open.
 */
export class TurnsGroup extends HttpApiGroup.make("turns")
  .add(
    HttpApiEndpoint.get("listActive", "/active-turns", {
      params: { workspaceId: Workspace.Id },
      query: { limit },
      success: Schema.Array(view),
      error: ApiErrors.member,
    }),
    HttpApiEndpoint.get("get", "/turns/:turnId", {
      params: turn,
      success: view,
      error: [...ApiErrors.member, ApiErrors.TurnNotFound],
    }),
    HttpApiEndpoint.get("watchLog", "/turns/:turnId/log/events", {
      params: turn,
      success: HttpApiSchema.StreamSse({ data: Turn.LogMessage, error: Turn.LogUnavailable }),
      error: [
        ...ApiErrors.member,
        ApiErrors.TurnNotFound,
        Turn.LogUnavailable.pipe(HttpApiSchema.status(503)),
        ApiErrors.TooManyStreams,
      ],
    }),
    HttpApiEndpoint.post("cancel", "/turns/:turnId/cancel", {
      params: turn,
      success: view,
      error: [...ApiErrors.member, ApiErrors.TurnNotFound, ApiErrors.TurnNotActive],
    }),
    HttpApiEndpoint.post("retry", "/turns/:turnId/retry", {
      params: turn,
      success: Turn.View.pipe(HttpApiSchema.status(201)).annotate({ identifier: "RetriedTurn" }),
      error: [...ApiErrors.member, ApiErrors.TurnNotFound, ApiErrors.TurnNotRetryable],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId") {}
