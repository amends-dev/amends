import { Api, ApiErrors, Principal } from "@amends/api-http";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register workspace creation over the gateway, requiring a human principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      create: ({ payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.createWorkspace(principal.id, payload);
        }),
    });
  }),
);

export * as WorkspacesHandlers from "./workspaces.ts";
