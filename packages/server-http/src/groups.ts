import { Api, Principal } from "@amends-dev/api-http";
import { ReadStateService } from "@amends-dev/core/read-state";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

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
            Effect.flatMap(GroupService.Service, (groupService) => groupService.listMine(query)),
          ),
        ),
      listPublic: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.Service, (groupService) => groupService.listPublic(query)),
          ),
        ),
      create: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.Service, (groupService) =>
              groupService.createTeam(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.Service, (groupService) =>
              groupService.rename({
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
            Effect.flatMap(GroupService.Service, (groupService) =>
              groupService.get(params.groupId),
            ),
          ),
        ),
      members: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.listCurrent(params.groupId, query),
            ),
          ),
        ),
      addMember: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.add({
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
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.remove({
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
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.join(params.groupId),
            ),
          ),
        ),
      leave: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupMembershipService.Service, (groupMembershipService) =>
              groupMembershipService.leave({
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
            Effect.flatMap(GroupFollowService.Service, (groupFollowService) =>
              groupFollowService.follow({
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
            Effect.flatMap(GroupFollowService.Service, (groupFollowService) =>
              groupFollowService.unfollow({
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
            Effect.flatMap(ReadStateService.Service, (readStateService) =>
              readStateService.markGroupRead({ groupId: params.groupId }),
            ),
          ),
        ),
    });
  }),
);

export * as GroupsHandlers from "./groups.ts";
