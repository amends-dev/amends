import { Identity } from "@amends-dev/core/identity";
import { Api, ApiErrors, Principal } from "@amends-dev/api-http";
import { InvitationService } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

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
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new ApiErrors.HumanRequired();
          return yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(InvitationService.Service, (invitationService) =>
              invitationService.accept(params.invitationId, principal.id, payload.name),
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
