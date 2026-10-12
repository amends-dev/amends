/**
 * Implements `AccountsGroup`, the accounts behind a workspace's people. In the workspace
 * `WorkspaceMember` entered as the principal's membership, the handler lists the invitations
 * through `InvitationService.list`, which authorizes the read, and the members through
 * `MemberService.list`, then reads the accounts of the human members and the recipients through the
 * host's `Accounts.findByIds`. `Routes` composes its `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { Identity } from "@amends-dev/core/identity";
import { Invitation, InvitationService, Member, MemberService } from "@amends-dev/core/workspace";
import { Accounts } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register the workspace accounts handler over the gateway and the host's accounts. Listing the
 * workspace's invitations authorizes the read: someone who invites by address may see addresses.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "accounts",
  Effect.fn(function* (handlers) {
    const accounts = yield* Accounts.Accounts;
    return handlers.handleAll({
      list: () =>
        Effect.gen(function* () {
          const invitations = yield* InvitationService.InvitationService.use(
            (invitationService) => invitationService.list,
          );
          const members = yield* MemberService.MemberService.use(
            (memberService) => memberService.list,
          );
          return yield* accounts.findByIds(humanIdsOf(members, invitations));
        }),
    });
  }),
);

/** The people a workspace names: its human members and its invitations' recipients, once each. */
const humanIdsOf = (
  members: ReadonlyArray<Member.Member>,
  invitations: ReadonlyArray<Invitation.Invitation>,
) => [
  ...new Set([
    ...members.flatMap(({ identity }) =>
      Identity.MemberReference.isAnyOf(["Human"])(identity) ? [identity.id] : [],
    ),
    ...invitations.map((invitation) => invitation.details.recipientId),
  ]),
];
