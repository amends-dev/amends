import { Api, ApiErrors, Principal } from "@amends/api-http";
import { Gateway } from "@amends/gateway";
import { OwnershipApplication } from "@amends/core/workspace";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register workspace creation and ownership operations over authenticated gateway entry.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      ownership: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(OwnershipApplication.Service, (ownership) => ownership.get),
          ),
        ),
      transferOwnership: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(OwnershipApplication.Service, (ownership) =>
              ownership.transfer(payload),
            ),
          );
        }),
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
