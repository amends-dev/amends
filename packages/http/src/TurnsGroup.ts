/**
 * The `turns` endpoint group: agents' turns on threads, and their logs. Its endpoints call
 * `TurnService`: `listActive`, `get`, `watchLog`, `cancel`, and `retry`. Every endpoint needs
 * active membership and a thread the caller may open, and stopping or retrying a turn needs
 * permission to direct its agent. Following a log is a server-sent event stream of
 * `Turn.LogMessage` that counts within the same limits as change streams, and ends with
 * `CoreError.Unavailable` when it cannot go on. `TurnsHandlers` implements it.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import { Turn } from "@amends-dev/core/turn"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import { limit } from "./internal/paging.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

const turn = { turnId: Turn.Id }
const view = Turn.View.annotate({ identifier: "Turn" })

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
      query: { limit },
      success: Schema.Array(view),
      error: ApiErrors.workspace
    }),
    HttpApiEndpoint.get("get", "/turns/:turnId", {
      params: turn,
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    }),
    HttpApiEndpoint.get("watchLog", "/turns/:turnId/log/events", {
      params: turn,
      success: HttpApiSchema.StreamSse({ data: Turn.LogMessage, error: CoreError.Unavailable }),
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.TooManyStreams]
    }),
    HttpApiEndpoint.post("cancel", "/turns/:turnId/cancel", {
      params: turn,
      success: view,
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Conflict]
    }),
    HttpApiEndpoint.post("retry", "/turns/:turnId/retry", {
      params: turn,
      success: Turn.View.pipe(HttpApiSchema.status(201)).annotate({ identifier: "RetriedTurn" }),
      error: [...ApiErrors.workspace, ApiErrors.NotFound, ApiErrors.Conflict]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication) {}
