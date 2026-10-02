import { Api, Principal } from "@amends/api-http";
import { WorkspaceDirectory } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register directory handlers over the host service, reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "me",
  Effect.fn(function* (handlers) {
    const workspaceDirectory = yield* WorkspaceDirectory.Service;
    return handlers.handleAll({
      workspaces: () =>
        Effect.flatMap(Principal, (principal) => workspaceDirectory.list(principal)),
    });
  }),
);

export * as MeHandlers from "./me.ts";
