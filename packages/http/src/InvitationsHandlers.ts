/**
 * Implements `InvitationsGroup`. Listing, issuing, and revoking call `InvitationService` in the
 * workspace `WorkspaceMember` entered as the principal's membership; issuing first finds or creates
 * the account of the address through the host's `Accounts.findOrCreate`, so the invitation records
 * that account's human ID. Accepting one is `WorkspacesHandlers`'s.
 *
 * @since 0.1.0
 */

import { InvitationService } from "@amends-dev/core/workspace"
import { Accounts } from "@amends-dev/gateway"
import * as Effect from "effect/Effect"
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder"
import * as Api from "./Api.ts"

/**
 * Register invitation handlers. An invitation goes to the account of the address it names, which
 * the host creates if it has none.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "invitations",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts.Accounts
    return handlers.handleAll({
      list: () => InvitationService.InvitationService.use((invitationService) => invitationService.list),
      issue: ({ headers, payload: { email, ...invitation } }) =>
        Effect.gen(function* () {
          const recipient = yield* accounts.findOrCreate(email)
          const invitationService = yield* InvitationService.InvitationService
          return yield* invitationService.issue(
            { ...invitation, recipientId: recipient.id },
            { requestKey: headers["idempotency-key"] }
          )
        }),
      revoke: ({ params }) =>
        InvitationService.InvitationService.use((invitationService) => invitationService.revoke(params.invitationId))
    })
  })
)
