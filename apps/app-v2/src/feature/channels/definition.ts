/**
 * The workspace's channels, each with the connection that receives its conversations and the group
 * they open in, and, for a person who may manage it, sending its conversations to come to another
 * group and removing it; and adding one, for a person who may, over a connection that gives
 * channels, into a group they belong to. The workspace page lists the host's integrations once and
 * informs the Block of them, to say which connections give channels.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Channel, ChannelId } from "@amends-dev/core/channel"
import { Connection } from "@amends-dev/core/connection"
import { Group, type GroupId, GroupMembership } from "@amends-dev/core/group"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { groupName } from "../../seen.ts"
import { ConnectionItem, connectionsGiving, Integrations } from "../connections/definition.ts"

/** A channel of the workspace, and whether a change to it is on its way. */
export const ChannelItem = Schema.Struct({ channel: Channel.Channel, pending: Schema.Boolean })
export type ChannelItem = typeof ChannelItem.Type

/**
 * The form open among the channels: adding one, over a connection that gives channels, into a
 * group, called something, and opening tasks or not; or sending a channel's conversations to come
 * to another group. A choice not made yet is empty.
 */
export const Form = defineTaggedUnion({
  Adding: {
    connectionId: Schema.String,
    groupId: Schema.String,
    name: Schema.String,
    opensTasks: Schema.Boolean,
    error: Schema.Option(Schema.String)
  },
  Redirecting: { channelId: ChannelId.ChannelId, groupId: Schema.String, error: Schema.Option(Schema.String) }
})
export type Form = typeof Form.Type

/**
 * The workspace's channels and connections, the integrations the host installs, the groups the
 * person can see with their own admissions to them and the members that name their conversations,
 * what the person may do, the form open among the channels, and why the last read or write failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  channels: Schema.Array(ChannelItem),
  connections: Schema.Array(ConnectionItem),
  integrations: Integrations,
  groups: Schema.Array(Group.Group),
  memberships: Schema.Array(GroupMembership.GroupMembership),
  members: Schema.Array(Member.Member),
  grants: Schema.Array(Grant.Grant),
  form: Schema.Option(Form),
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedChannels: { channels: Schema.Array(ChannelItem) },
  ReceivedConnections: { connections: Schema.Array(ConnectionItem) },
  ReceivedGroups: { groups: Schema.Array(Group.Group) },
  ReceivedMemberships: { memberships: Schema.Array(GroupMembership.GroupMembership) },
  ReceivedMembers: { members: Schema.Array(Member.Member) },
  ReceivedGrants: { grants: Schema.Array(Grant.Grant) },
  ReceivedIntegrations: { integrations: Schema.Array(Connection.IntegrationView) },
  FailedLoadIntegrations: { error: Schema.String },
  FailedRead: { error: Schema.String },
  ClickedReloadIntegrations: {},
  ClickedAdd: {},
  ChoseConnection: { connectionId: Schema.String },
  ChoseGroup: { groupId: Schema.String },
  TypedName: { name: Schema.String },
  ToggledOpensTasks: { opensTasks: Schema.Boolean },
  SubmittedForm: {},
  ClickedCancelForm: {},
  ClickedRedirect: { channelId: ChannelId.ChannelId },
  ClickedRemove: { channelId: ChannelId.ChannelId },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

/** What the Block asks of the workspace page: to list the integrations again, once the host could not be reached. */
export const OutMessage = defineMessageUnion({ RequestedIntegrations: {} })
export type OutMessage = typeof OutMessage.Type

export const ChannelsDefinition = Block.makeDefinition("Channels", { Model, Message, OutMessage })

/** The channel `channelId`, while the workspace has it. */
export const findChannel = (
  model: Pick<Model, "channels">,
  channelId: ChannelId.ChannelId
): Option.Option<ChannelItem> => Option.fromUndefinedOr(model.channels.find(({ channel }) => channel.id === channelId))

/** Whether the person belongs to `group`: a conversation of theirs, or a team they are admitted to. */
const belongsTo = (model: Pick<Model, "memberId" | "memberships">, group: Group.Group): boolean =>
  group.kind === "Team"
    ? model.memberships.some((membership) => membership.groupId === group.id)
    : group.memberIds.includes(model.memberId)

/** The groups the person belongs to, where a channel's conversations may open, each as its ID and name. */
export const destinations = (
  model: Pick<Model, "memberId" | "memberships" | "groups" | "members">
): ReadonlyArray<readonly [GroupId.GroupId, string]> =>
  model.groups.flatMap((group) =>
    belongsTo(model, group) ? [[group.id, groupName(group, model.members, model.memberId)] as const] : []
  )

/** A group's name, or that the person no longer sees it. */
export const groupNameOf = (model: Pick<Model, "groups" | "members" | "memberId">, groupId: GroupId.GroupId): string =>
  Option.match(Option.fromUndefinedOr(model.groups.find((group) => group.id === groupId)), {
    onNone: () => "a group you don't see",
    onSome: (group) => groupName(group, model.members, model.memberId)
  })

const lacksConnection = "Choose the connection that receives its conversations."
const lacksGroup = "Choose the group its conversations open in."
const lacksName = "Name the channel."

/** What `form` still wants before it is sent, if anything: a choice among those offered, or a name. */
export const whatFormLacks = (model: Model, form: Form): Option.Option<string> => {
  const isOfferedGroup = (groupId: string) => destinations(model).some(([id]) => id === groupId)
  return Form.match(form, {
    Adding: ({ connectionId, groupId, name }) =>
      !connectionsGiving(model, "channels").some(([id]) => id === connectionId)
        ? Option.some(lacksConnection)
        : !isOfferedGroup(groupId)
          ? Option.some(lacksGroup)
          : name.trim() === ""
            ? Option.some(lacksName)
            : Option.none(),
    Redirecting: ({ groupId }) => (isOfferedGroup(groupId) ? Option.none() : Option.some(lacksGroup))
  })
}
