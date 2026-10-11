/**
 * The `turns` endpoint group: agents' turns on threads, and their logs. Its endpoints call
 * `TurnService`: `listActive`, `get`, `watchLog`, `cancel`, and `retry`. Every endpoint needs
 * active membership and a thread the caller may open, and stopping or retrying a turn needs
 * permission to direct its agent. Following a log is a server-sent event stream of
 * `Turn.LogMessage` that counts within the same limits as change streams, and ends with
 * `Turn.LogUnavailable` when it cannot go on. `TurnsHandlers` in `@amends-dev/server-http`
 * implements it.
 *
 * @since 0.1.0
 */
import { Turn } from "@amends-dev/core/turn";
import { Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";
import { limit } from "./internal/paging.ts";

const turn = { workspaceId: Workspace.Id, turnId: Turn.Id };
const view = Turn.View.annotate({ identifier: "Turn" });

/**
 * Agents' turns: each agent's work on what was asked of it in a thread, which a reader of the
 * thread may follow, with its log, as a stream of its items and the step being written until the
 * turn ends. Whoever may direct the agent may stop an active turn, or retry one that failed or
 * stopped; each turn says whether the caller may do either now. The workspace's active turns are
 * those in threads the caller may open.
 *
 * @category models
 * @since 0.1.0
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
