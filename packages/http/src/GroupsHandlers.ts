/**
 * Implements `GroupsGroup`. Each handler enters the workspace as the principal's membership through
 * `Gateway.asMember` and calls one core operation: `GroupService` for listing, creating, renaming,
 * and reading groups, `GroupMembershipService` for rosters, joining, and leaving,
 * `GroupFollowService` for following, and `ReadStateService.markGroupRead`. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { makeAsMember } from "./internal/as-member.ts";
import { ReadStateService } from "@amends-dev/core/read-state";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/http-api";

/**
 * Register group handlers, each entering the workspace as the request's principal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(
  Api.Api,
  "groups",
  Effect.fn(function* (handlers) {
    const asMember = yield* makeAsMember;
    return handlers.handleAll({
      list: ({ params, query }) =>
        asMember(
          params.workspaceId,
          GroupService.GroupService.use((groupService) => groupService.listMine(query)),
        ),
      listPublic: ({ params, query }) =>
        asMember(
          params.workspaceId,
          GroupService.GroupService.use((groupService) => groupService.listPublic(query)),
        ),
      create: ({ params, headers, payload }) =>
        asMember(
          params.workspaceId,
          GroupService.GroupService.use((groupService) =>
            groupService.createTeam(payload, { requestKey: headers["idempotency-key"] }),
          ),
        ),
      rename: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          GroupService.GroupService.use((groupService) =>
            groupService.rename({
              groupId: params.groupId,
              name: payload.name,
              expectedName: payload.expectedName,
            }),
          ),
        ),
      get: ({ params }) =>
        asMember(
          params.workspaceId,
          GroupService.GroupService.use((groupService) => groupService.get(params.groupId)),
        ),
      members: ({ params, query }) =>
        asMember(
          params.workspaceId,
          GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
            groupMembershipService.listCurrent(params.groupId, query),
          ),
        ),
      addMember: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
            groupMembershipService.add({
              groupId: params.groupId,
              memberId: payload.memberId,
            }),
          ),
        ),
      removeMember: ({ params }) =>
        asMember(
          params.workspaceId,
          GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
            groupMembershipService.remove({
              groupId: params.groupId,
              membershipId: params.membershipId,
            }),
          ),
        ),
      join: ({ params }) =>
        asMember(
          params.workspaceId,
          GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
            groupMembershipService.join(params.groupId),
          ),
        ),
      leave: ({ params }) =>
        asMember(
          params.workspaceId,
          GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
            groupMembershipService.leave({
              groupId: params.groupId,
              membershipId: params.membershipId,
            }),
          ),
        ),
      follow: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          GroupFollowService.GroupFollowService.use((groupFollowService) =>
            groupFollowService.follow({
              groupId: params.groupId,
              memberId: payload.memberId,
            }),
          ),
        ),
      unfollow: ({ params, payload }) =>
        asMember(
          params.workspaceId,
          GroupFollowService.GroupFollowService.use((groupFollowService) =>
            groupFollowService.unfollow({
              groupId: params.groupId,
              memberId: payload.memberId,
            }),
          ),
        ),
      markRead: ({ params }) =>
        asMember(
          params.workspaceId,
          ReadStateService.ReadStateService.use((readStateService) =>
            readStateService.markGroupRead({ groupId: params.groupId }),
          ),
        ),
    });
  }),
);
