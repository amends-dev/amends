import { Api, Principal } from "@amends/api-http";
import { ReadStateApplication } from "@amends/core/attention";
import {
  GroupApplication,
  GroupFollowApplication,
  GroupMembershipApplication,
} from "@amends/core/group";
import { Gateway } from "@amends/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

/**
 * Register group handlers, capturing the gateway and reading the principal per request.
 *
 * @category layers
 */
export const layer = HttpApiBuilder.group(
  Api,
  "groups",
  Effect.fn(function* (handlers) {
    const gateway = yield* Gateway.Service;
    return handlers.handleAll({
      list: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groups) => groups.listMine(query)),
          ),
        ),
      listPublic: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groups) => groups.listPublic(query)),
          ),
        ),
      create: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groups) =>
              groups.createTeam(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groups) =>
              groups.rename({
                groupId: params.groupId,
                name: payload.name,
                expectedName: payload.expectedName,
              }),
            ),
          ),
        ),
      get: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groups) => groups.get(params.groupId)),
          ),
        ),
      members: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (memberships) =>
              memberships.listCurrent(params.groupId, query),
            ),
          ),
        ),
      addMember: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (memberships) =>
              memberships.add({ groupId: params.groupId, memberId: payload.memberId }),
            ),
          ),
        ),
      removeMember: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (memberships) =>
              memberships.remove({ groupId: params.groupId, membershipId: params.membershipId }),
            ),
          ),
        ),
      join: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (memberships) =>
              memberships.join(params.groupId),
            ),
          ),
        ),
      leave: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (memberships) =>
              memberships.leave({ groupId: params.groupId, membershipId: params.membershipId }),
            ),
          ),
        ),
      follow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupFollowApplication.Service, (follows) =>
              follows.follow({ groupId: params.groupId, memberId: payload.memberId }),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupFollowApplication.Service, (follows) =>
              follows.unfollow({ groupId: params.groupId, memberId: payload.memberId }),
            ),
          ),
        ),
      markRead: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ReadStateApplication.Service, (readState) =>
              readState.markGroupRead({ groupId: params.groupId }),
            ),
          ),
        ),
    });
  }),
);

export * as GroupsHandlers from "./groups.ts";
