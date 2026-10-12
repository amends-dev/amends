/**
 * Implements `InvitationsGroup`. Listing, issuing, and revoking enter the workspace as the
 * principal's membership through `Gateway.asMember` and call `InvitationService`; issuing first
 * finds or creates the account of the address through the host's `Accounts.findOrCreate`, so the
 * invitation records that account's human ID. Accepting refuses an agent with
 * `HumanRequired`, then enters through `Gateway.inWorkspace`, since the recipient is not
 * yet a member, and calls `InvitationService.accept` with the person's human ID.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import * as Api from "./Api.ts";
import * as Authentication from "./Authentication.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { InvitationService } from "@amends-dev/core/workspace";
import { Accounts, Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";
import { CoreError } from "@amends-dev/core/error";

/**
 * Register invitation handlers, capturing the gateway and reading the principal per request. An
 * invitation goes to the account of the address it names, which the host creates if it has none.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "invitations",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    const gateway = yield* Gateway.Gateway;
    const accounts = yield* Accounts.Accounts;
    return handlers.handleAll({
      list: ({ params }) =>
        asMember(
          params.workspaceId,
          InvitationService.InvitationService.use((invitationService) => invitationService.list),
        ),
      issue: ({ params, headers, payload: { email, ...invitation } }) =>
        asMember(
          params.workspaceId,
          Effect.gen(function* () {
            const recipient = yield* accounts.findOrCreate(email);
            const invitationService = yield* InvitationService.InvitationService;
            return yield* invitationService.issue(
              { ...invitation, recipientId: recipient.id },
              { requestKey: headers["idempotency-key"] },
            );
          }),
        ),
      accept: ({ params, payload }) =>
        Effect.gen(function* () {
          const principal = yield* Authentication.Principal;
          if (!Identity.MemberReference.isAnyOf(["Human"])(principal))
            return yield* new CoreError.Denied({ reason: new CoreError.HumanRequired() });
          return yield* gateway.inWorkspace(
            params.workspaceId,
            Effect.flatMap(InvitationService.InvitationService, (invitationService) =>
              invitationService.accept(params.invitationId, principal.id, payload.name),
            ),
          );
        }),
      revoke: ({ params }) =>
        asMember(
          params.workspaceId,
          InvitationService.InvitationService.use((invitationService) =>
            invitationService.revoke(params.invitationId),
          ),
        ),
    });
  }),
);
