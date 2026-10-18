/**
 * The `presence` endpoint group: who has the workspace open, and where they are typing. Its
 * endpoints call `PresenceService`: `watch` and `type`. Every endpoint needs active membership.
 * Following presence is a server-sent event stream of who is present, each time it changes, which
 * counts within the same limits as other streams and makes the caller present for as long as it is
 * open; typing is said by a request, and lapses unless said again. `PresenceHandlers` implements it.
 *
 * @since 0.1.0
 */

import { CoreError } from "@amends-dev/core/error"
import { Presence } from "@amends-dev/core/presence"
import { ThreadId } from "@amends-dev/core/thread"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"
import * as WorkspaceMember from "./WorkspaceMember.ts"

/**
 * Who is present in the workspace: everyone with it open, and where each is typing, in threads the
 * caller may read. Following it keeps the caller present; saying where one types is a request.
 *
 * @category models
 * @since 0.1.0
 */
export class PresenceGroup extends HttpApiGroup.make("presence")
  .add(
    HttpApiEndpoint.get("watch", "/presence/events", {
      success: HttpApiSchema.StreamSse({
        data: Schema.Array(Presence.Present).annotate({ identifier: "Present" }),
        error: CoreError.Unavailable
      }),
      error: [...ApiErrors.workspace, ApiErrors.TooManyStreams]
    }),
    HttpApiEndpoint.put("type", "/presence/typing", {
      payload: Schema.Struct({ threadId: Schema.NullOr(ThreadId.ThreadId) }),
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.workspace, ApiErrors.NotFound]
    })
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication) {}
