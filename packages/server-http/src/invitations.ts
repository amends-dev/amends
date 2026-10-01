import { Api, ApiErrors, Principal } from "@amends/api-http";
import { InvitationService } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register invitation handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "invitations",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      list: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              InvitationService.Service,
              (invitationService) => invitationService.list,
            ),
          ),
        ),
      issue: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(InvitationService.Service, (invitationService) =>
              invitationService.issue(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      accept: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(InvitationService.Service, (invitationService) =>
              invitationService.accept(params.invitationId, principal.id, payload ?? {}),
            ),
          );
        }),
      revoke: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(InvitationService.Service, (invitationService) =>
              invitationService.revoke(params.invitationId),
            ),
          ),
        ),
    });
  }),
);

export * as InvitationsHandlers from "./invitations.ts";
