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
    const gateway = yield* Gateway.Gateway;
    return handlers.handleAll({
      list: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.listMine(query),
            ),
          ),
        ),
      listPublic: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.listPublic(query),
            ),
          ),
        ),
      create: ({ params, headers, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam(payload, { requestKey: headers["idempotency-key"] }),
            ),
          ),
        ),
      rename: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(GroupService.GroupService, (groupService) =>
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
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.get(params.groupId),
            ),
          ),
        ),
      members: ({ params, query }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              GroupMembershipService.GroupMembershipService,
              (groupMembershipService) => groupMembershipService.listCurrent(params.groupId, query),
            ),
          ),
        ),
      addMember: ({ params, payload }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              GroupMembershipService.GroupMembershipService,
              (groupMembershipService) =>
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
            Effect.flatMap(
              GroupMembershipService.GroupMembershipService,
              (groupMembershipService) =>
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
            Effect.flatMap(
              GroupMembershipService.GroupMembershipService,
              (groupMembershipService) => groupMembershipService.join(params.groupId),
            ),
          ),
        ),
      leave: ({ params }) =>
        Effect.flatMap(Principal, (principal) =>
          gateway.asMember(
            params.workspaceId,
            principal,
            Effect.flatMap(
              GroupMembershipService.GroupMembershipService,
              (groupMembershipService) =>
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
            Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
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
            Effect.flatMap(GroupFollowService.GroupFollowService, (groupFollowService) =>
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
            Effect.flatMap(ReadStateService.ReadStateService, (readStateService) =>
              readStateService.markGroupRead({ groupId: params.groupId }),
            ),
          ),
        ),
    });
  }),
);
