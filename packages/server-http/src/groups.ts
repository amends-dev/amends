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
            Effect.flatMap(GroupApplication.Service, (groupApplication) =>
              groupApplication.listMine(query),
            ),
          ),
        ),
      listPublic: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groupApplication) =>
              groupApplication.listPublic(query),
            ),
          ),
        ),
      create: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groupApplication) =>
              groupApplication.createTeam(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupApplication.Service, (groupApplication) =>
              groupApplication.rename({
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
            Effect.flatMap(GroupApplication.Service, (groupApplication) =>
              groupApplication.get(params.groupId),
            ),
          ),
        ),
      members: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (groupMembershipApplication) =>
              groupMembershipApplication.listCurrent(params.groupId, query),
            ),
          ),
        ),
      addMember: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (groupMembershipApplication) =>
              groupMembershipApplication.add({
                groupId: params.groupId,
                memberId: payload.memberId,
              }),
            ),
          ),
        ),
      removeMember: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (groupMembershipApplication) =>
              groupMembershipApplication.remove({
                groupId: params.groupId,
                membershipId: params.membershipId,
              }),
            ),
          ),
        ),
      join: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (groupMembershipApplication) =>
              groupMembershipApplication.join(params.groupId),
            ),
          ),
        ),
      leave: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipApplication.Service, (groupMembershipApplication) =>
              groupMembershipApplication.leave({
                groupId: params.groupId,
                membershipId: params.membershipId,
              }),
            ),
          ),
        ),
      follow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupFollowApplication.Service, (groupFollowApplication) =>
              groupFollowApplication.follow({
                groupId: params.groupId,
                memberId: payload.memberId,
              }),
            ),
          ),
        ),
      unfollow: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupFollowApplication.Service, (groupFollowApplication) =>
              groupFollowApplication.unfollow({
                groupId: params.groupId,
                memberId: payload.memberId,
              }),
            ),
          ),
        ),
      markRead: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(ReadStateApplication.Service, (readStateApplication) =>
              readStateApplication.markGroupRead({ groupId: params.groupId }),
            ),
          ),
        ),
    });
  }),
);

export * as GroupsHandlers from "./groups.ts";
