/**
 * Implements `GroupsGroup`. Each handler runs in the workspace `WorkspaceMember` entered as the
 * principal's membership, and calls one core operation: `GroupService` for listing, creating,
 * renaming, and reading groups, `GroupMembershipService` for rosters, joining, and leaving,
 * `GroupFollowService` for following, and `ReadStateService.markGroupRead`. `Routes` composes its
 * `layer` with the other groups'.
 *
 * @since 0.1.0
 */
import * as Api from "./Api.ts";
import { ReadStateService } from "@amends-dev/core/read-state";
import { GroupService, GroupFollowService, GroupMembershipService } from "@amends-dev/core/group";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

/**
 * Register group handlers.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = HttpApiBuilder.group(Api.Api, "groups", (handlers) =>
  handlers.handleAll({
    list: ({ query }) =>
      GroupService.GroupService.use((groupService) => groupService.listMine(query)),
    listPublic: ({ query }) =>
      GroupService.GroupService.use((groupService) => groupService.listPublic(query)),
    create: ({ headers, payload }) =>
      GroupService.GroupService.use((groupService) =>
        groupService.createTeam(payload, { requestKey: headers["idempotency-key"] }),
      ),
    rename: ({ params, payload }) =>
      GroupService.GroupService.use((groupService) =>
        groupService.rename({
          groupId: params.groupId,
          name: payload.name,
          expectedName: payload.expectedName,
        }),
      ),
    get: ({ params }) =>
      GroupService.GroupService.use((groupService) => groupService.get(params.groupId)),
    members: ({ params, query }) =>
      GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
        groupMembershipService.listCurrent(params.groupId, query),
      ),
    addMember: ({ params, payload }) =>
      GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
        groupMembershipService.add({
          groupId: params.groupId,
          memberId: payload.memberId,
        }),
      ),
    removeMember: ({ params }) =>
      GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
        groupMembershipService.remove({
          groupId: params.groupId,
          membershipId: params.membershipId,
        }),
      ),
    join: ({ params }) =>
      GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
        groupMembershipService.join(params.groupId),
      ),
    leave: ({ params }) =>
      GroupMembershipService.GroupMembershipService.use((groupMembershipService) =>
        groupMembershipService.leave({
          groupId: params.groupId,
          membershipId: params.membershipId,
        }),
      ),
    follow: ({ params, payload }) =>
      GroupFollowService.GroupFollowService.use((groupFollowService) =>
        groupFollowService.follow({
          groupId: params.groupId,
          memberId: payload.memberId,
        }),
      ),
    unfollow: ({ params, payload }) =>
      GroupFollowService.GroupFollowService.use((groupFollowService) =>
        groupFollowService.unfollow({
          groupId: params.groupId,
          memberId: payload.memberId,
        }),
      ),
    markRead: ({ params }) =>
      ReadStateService.ReadStateService.use((readStateService) =>
        readStateService.markGroupRead({ groupId: params.groupId }),
      ),
  }),
);
