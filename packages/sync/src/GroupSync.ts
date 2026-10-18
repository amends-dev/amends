/**
 * What a member does with groups, as actions their browser writes: it applies each at once, and the
 * server runs it as a `GroupService`, `GroupMembershipService`, `GroupFollowService`, or
 * `ReadStateService` operation.
 *
 * @since 0.1.0
 */

import { Group, GroupFollow, GroupId, GroupMembership } from "@amends-dev/core/group"
import { ReadState } from "@amends-dev/core/read-state"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"

/**
 * What a member does with groups. Each action's primary key is the group it acts on, or the
 * workspace a new team is created in.
 *
 * @category events
 * @since 0.1.0
 */
export const Actions = EventGroup.empty
  // Create a team: `GroupService.createTeam`. Direct groups start with their first thread.
  .add({ tag: "TeamCreated", primaryKey: () => "workspace", payload: Group.CreateTeamInput })
  .add({ tag: "GroupRenamed", primaryKey: ({ groupId }) => groupId, payload: Group.RenameInput })
  // Admit another member, or join a group oneself: `GroupMembershipService.add` and `join`.
  .add({ tag: "GroupMemberAdded", primaryKey: ({ groupId }) => groupId, payload: GroupMembership.AddInput })
  .add({
    tag: "GroupJoined",
    primaryKey: ({ groupId }) => groupId,
    payload: Schema.Struct({ groupId: GroupId.GroupId })
  })
  // End another member's membership, or one's own: `GroupMembershipService.remove` and `leave`.
  .add({ tag: "GroupMemberRemoved", primaryKey: ({ groupId }) => groupId, payload: GroupMembership.RemoveInput })
  .add({ tag: "GroupLeft", primaryKey: ({ groupId }) => groupId, payload: GroupMembership.LeaveInput })
  .add({ tag: "GroupFollowed", primaryKey: ({ groupId }) => groupId, payload: GroupFollow.Input })
  .add({ tag: "GroupUnfollowed", primaryKey: ({ groupId }) => groupId, payload: GroupFollow.Input })
  // Note when the member read a group: `ReadStateService.markGroupRead`.
  .add({ tag: "GroupMarkedRead", primaryKey: ({ groupId }) => groupId, payload: ReadState.MarkGroupReadInput })
