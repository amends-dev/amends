import { Api, Principal } from "@amends-dev/api-http";
import { Identity } from "@amends-dev/core/identity";
import { Invitation, InvitationService, Member, MemberService } from "@amends-dev/core/workspace";
import { Accounts, Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the workspace accounts handler over the gateway and the host's accounts. Listing the
 * workspace's invitations authorizes the read: someone who invites by address may see addresses.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "accounts",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    const accounts = yield* Accounts.Service;
    return handlers.handleAll({
      list: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.gen(function* () {
              const invitations = yield* Effect.flatMap(
                InvitationService.Service,
                (invitationService) => invitationService.list,
              );
              const members = yield* Effect.flatMap(
                MemberService.Service,
                (memberService) => memberService.list,
              );
              return yield* accounts.findByIds(humanIdsOf(members, invitations));
            }),
          ),
        ),
    });
  }),
);

/** The people a workspace names: its human members and its invitations' recipients, once each. */
const humanIdsOf = (
  members: ReadonlyArray<Member.Record>,
  invitations: ReadonlyArray<Invitation.Record>,
) => [
  ...new Set([
    ...members.flatMap(({ identity }) =>
      Identity.MemberReference.isAnyOf(["Human"])(identity) ? [identity.id] : [],
    ),
    ...invitations.map((invitation) => invitation.details.recipientId),
  ]),
];

export * as AccountsHandlers from "./accounts.ts";
