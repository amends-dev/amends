import { Api, ApiErrors, Principal } from "@amends/api-http";
import { InvitationApplication } from "@amends/core/workspace";
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
            Effect.flatMap(InvitationApplication.Service, (invitations) => invitations.list),
          ),
        ),
      issue: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.issue(payload),
            ),
          ),
        ),
      accept: ({ params }) =>
        Effect.gen(function* () {
          const principal = yield* Principal;
          if (principal._tag !== "Human") return yield* new ApiErrors.HumanRequired();
          return yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.accept(params.invitationId, principal.id),
            ),
          );
        }),
      revoke: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(InvitationApplication.Service, (invitations) =>
              invitations.revoke(params.invitationId),
            ),
          ),
        ),
      enable: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.enableInvitations(params.workspaceId, principal),
        ),
    });
  }),
);

export * as InvitationsHandlers from "./invitations.ts";
