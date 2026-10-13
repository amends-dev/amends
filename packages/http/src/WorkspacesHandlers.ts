/**
 * Implements `WorkspacesGroup`. Both handlers refuse an agent with `HumanRequired`. Creating a
 * workspace calls the gateway's `createWorkspace` for the person, with no membership to enter.
 * Accepting an invitation enters through `Gateway.inWorkspace`, since the recipient is not yet a
 * member, and calls `InvitationService.accept` with the person's human ID.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { Gateway } from "@amends-dev/gateway";
import { InvitationService } from "@amends-dev/core/workspace";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { requireHuman } from "./internal/human.ts";

/**
 * Register the workspace handlers: creation, and accepting an invitation, reading the principal per
 * request.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "workspaces",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      create: ({ headers, payload }) =>
        Effect.gen(function* () {
          const person = yield* requireHuman;
          return yield* gateway.createWorkspace(person.id, payload, {
            requestKey: headers["idempotency-key"],
          });
        }),
      acceptInvitation: ({ params, payload }) =>
        Effect.gen(function* () {
          const person = yield* requireHuman;
          return yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
              invitationService.accept(params.invitationId, person.id, payload.name),
            ),
          );
        }),
    });
  }),
);
