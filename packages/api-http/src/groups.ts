import { Group, GroupFollow, GroupMembership } from "@amends/core/group";
import { Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";
import { limit } from "./paging.ts";

const group = { workspaceId: Workspace.Id, groupId: Group.Id };
const admission = { ...group, membershipId: GroupMembership.Id };
const record = Group.Record.annotate({ identifier: "Group" });
const membership = GroupMembership.Record.annotate({ identifier: "GroupMembership" });
const follower = Schema.Struct({ memberId: GroupFollow.Input.fields.memberId });

/**
 * The caller's groups, their rosters, following, and catching up. Every read requires current
 * membership of the group; a group the caller does not belong to answers as missing. Public groups
 * can also be browsed and joined; their threads stay with their members.
 */
export class GroupsGroup extends HttpApiGroup.make("groups")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      query: {
        limit,
        after: Schema.optionalKey(Group.Id).annotate({
          description: "Exclusive boundary: the last group ID of the previous page.",
        }),
      },
      success: Schema.Array(Group.ListItem.annotate({ identifier: "GroupListItem" })),
      error: [...ApiErrors.member, ...ApiErrors.group],
    }),
    HttpApiEndpoint.get("listPublic", "/public", {
      params: { workspaceId: Workspace.Id },
      query: {
        limit,
        after: Schema.optionalKey(Group.Id).annotate({
          description: "Exclusive boundary: the last group ID of the previous page.",
        }),
      },
      success: Schema.Array(Group.PublicItem.annotate({ identifier: "PublicGroup" })),
      error: [...ApiErrors.member, ...ApiErrors.group],
    }),
    HttpApiEndpoint.post("create", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: Group.CreateTeamInput,
      success: Group.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedGroup",
      }),
      error: [...ApiErrors.member, ...ApiErrors.group],
    }),
    HttpApiEndpoint.post("rename", "/:groupId/rename", {
      params: group,
      payload: Schema.Struct({
        name: Group.RenameInput.fields.name,
        expectedName: Group.RenameInput.fields.expectedName,
      }),
      success: Group.Record,
      error: [
        ...ApiErrors.member,
        ...ApiErrors.group,
        ApiErrors.NotRenamable,
        ApiErrors.GroupChanged,
      ],
    }),
    HttpApiEndpoint.get("get", "/:groupId", {
      params: group,
      success: record,
      error: [...ApiErrors.member, ...ApiErrors.group],
    }),
    HttpApiEndpoint.get("members", "/:groupId/members", {
      params: group,
      query: {
        limit,
        after: Schema.optionalKey(GroupMembership.Id).annotate({
          description: "Exclusive boundary: the last admission ID of the previous page.",
        }),
      },
      success: Schema.Array(membership),
      error: [...ApiErrors.member, ...ApiErrors.groupMembership],
    }),
    HttpApiEndpoint.post("addMember", "/:groupId/members", {
      params: group,
      payload: Schema.Struct({ memberId: GroupMembership.AddInput.fields.memberId }),
      success: GroupMembership.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "AddedGroupMembership",
      }),
      error: [...ApiErrors.member, ...ApiErrors.groupMembership],
    }),
    HttpApiEndpoint.post("join", "/:groupId/join", {
      params: group,
      success: membership,
      error: [...ApiErrors.member, ...ApiErrors.groupMembership],
    }),
    HttpApiEndpoint.delete("removeMember", "/:groupId/members/:membershipId", {
      params: admission,
      success: membership,
      error: [...ApiErrors.member, ...ApiErrors.groupMembership],
    }),
    HttpApiEndpoint.post("leave", "/:groupId/members/:membershipId/leave", {
      params: admission,
      success: membership,
      error: [...ApiErrors.member, ...ApiErrors.groupMembership],
    }),
    HttpApiEndpoint.post("follow", "/:groupId/follow", {
      params: group,
      payload: follower,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.groupFollow],
    }),
    HttpApiEndpoint.post("unfollow", "/:groupId/unfollow", {
      params: group,
      payload: follower,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.groupFollow],
    }),
    HttpApiEndpoint.post("markRead", "/:groupId/read", {
      params: group,
      success: HttpApiSchema.NoContent,
      error: [...ApiErrors.member, ...ApiErrors.readState],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/groups") {}
