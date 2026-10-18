/**
 * What a member's browser and the server exchange about groups. `Actions` are what the member does
 * with groups, which their browser applies at once and the server runs as `GroupService`,
 * `GroupMembershipService`, `GroupFollowService`, and `ReadStateService` operations. `Changes` keep
 * the groups, their memberships, the member's follows, and the times they read each group in their
 * replica current.
 *
 * @since 0.1.0
 */

import { Group, GroupFollow, GroupId, GroupMembership } from "@amends-dev/core/group"
import { ReadState } from "@amends-dev/core/read-state"
import { MemberId } from "@amends-dev/core/workspace"
import * as EventGroup from "effect/eventlog/EventGroup"
import * as Schema from "effect/Schema"
import { recordChanges } from "./internal/recordChanges.ts"

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

/**
 * The group records a replica holds: groups, their memberships, which the members of a public team
 * and of every group the member belongs to see, the member's follows, and when they last read each
 * group.
 *
 * @category events
 * @since 0.1.0
 */
export const Changes = EventGroup.empty.pipe(
  recordChanges("Group", Group.Group, Schema.Struct({ id: GroupId.GroupId }), ({ id }) => ({ id })),
  recordChanges(
    "GroupMembership",
    GroupMembership.GroupMembership,
    Schema.Struct({ id: GroupMembership.GroupMembershipId }),
    ({ id }) => ({ id })
  ),
  recordChanges("GroupFollow", GroupFollow.GroupFollow, Schema.Struct({ id: GroupFollow.GroupFollowId }), ({ id }) => ({
    id
  })),
  recordChanges(
    "GroupRead",
    ReadState.GroupRead,
    Schema.Struct({ memberId: MemberId.MemberId, groupId: GroupId.GroupId }),
    ({ memberId, groupId }) => ({ memberId, groupId })
  )
)
