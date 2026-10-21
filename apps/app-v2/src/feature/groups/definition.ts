/**
 * The groups the person can see in a workspace, as a list to pick one from: the teams they belong to, general first
 * and then by name, and their conversations by the other members in them; as a page to browse, the teams they belong
 * to and the public teams they may join, on a tab each, narrowed by a search; and the modal where they start a team,
 * or a conversation with other members: a team has a name, a visibility, and members, and a conversation only the
 * people it is with. It reports the group the person picks, the people they pick to talk with when they have no
 * conversation with exactly them, and when they ask to browse, and its parent tells it which group is open and when to
 * talk with a member: the conversation of the two when there is one, and otherwise the person to start one with. The
 * browse page's Discover tab joins a public team in place and reports it, with where it is, to be confirmed. A group's
 * row says what waits for the person in it, whether it has activity they have not read, and whether an agent is at work
 * in it, and the Block marks the group open as read. A conversation's row is marked by the member it is with, an
 * agent's with how it stands and what it is doing, and after the conversations the sidebar lists the members the person
 * has none with yet, to start one.
 */

import { Grant } from "@amends-dev/core/authorization"
import { Group, GroupId, GroupMembership } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as RadioGroup from "@foldkit/ui/radioGroup"
import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"
import { MembersComboboxBlock } from "../../memberPicker.ts"
import { foldAccents, groupName, isJoinable } from "../../seen.ts"
import { activityOfAgent, AgentItem } from "../agents/definition.ts"
import { conversationAmong } from "./conversation.ts"

/** A group the person can see, whether it is still being created, and how many members it has. */
export const GroupItem = Schema.Struct({ group: Group.Group, pending: Schema.Boolean, members: Schema.Int })
export type GroupItem = typeof GroupItem.Type

/** A group with activity the person has not read, and when its latest activity was. */
export const NewActivity = Schema.Struct({ groupId: GroupId.GroupId, latestAt: Schema.DateTimeUtc })
export type NewActivity = typeof NewActivity.Type

/** How many of the person's notifications from a group's threads wait for them. */
export const Waiting = Schema.Struct({ groupId: GroupId.GroupId, count: Schema.Int })
export type Waiting = typeof Waiting.Type

/** A group the person can see that is a team, which has a name and is public or private. */
export type TeamItem = GroupItem & Readonly<{ group: Group.Team }>

const isTeamItem = (item: GroupItem): item is TeamItem => item.group.kind === "Team"

/**
 * A team being created, once its form is sent: the name it was sent under, and which groups the person could see
 * then, so that the one the store makes is told from the others, and whether the store has kept the action. The
 * dialog stays on it until the new team is listed.
 */
export const CreatingTeam = Schema.Struct({
  name: Schema.String,
  knownGroupIds: Schema.Array(GroupId.GroupId),
  isWritten: Schema.Boolean
})
export type CreatingTeam = typeof CreatingTeam.Type

/**
 * What the person is starting: a team, by name, visibility, and the members to add besides themself, with, once it is
 * sent, that attempt and why the last one failed, or a conversation, with the members chosen to have it with.
 */
export const Starting = defineTaggedUnion({
  Team: {
    name: Schema.String,
    visibility: Group.Visibility,
    memberIds: Schema.Array(MemberId.MemberId),
    creating: Schema.Option(CreatingTeam),
    failure: Schema.Option(Schema.String)
  },
  Conversation: { memberIds: Schema.Array(MemberId.MemberId) }
})
export type Starting = typeof Starting.Type

/** The team form: what `Starting.Team` holds. */
export type TeamForm = typeof Starting.Team.Type

/** The radio group that chooses whether a new team is public or private. */
export const VisibilityRadioGroupBlock = RadioGroup.create<Group.Visibility>()

/** The `id` of the radio group of the team form, which names its elements. */
export const teamVisibilityId = "groups-visibility"

/**
 * The `id` of the members picker of the form for a team or a conversation, which names its elements, such as the input
 * that takes focus.
 */
export const startingMembersId = "groups-members"

/** Which groups the browse page lists: those the person belongs to, or the public teams they may join. */
export const BrowseTab = Schema.Literals(["Yours", "Discover"])
export type BrowseTab = typeof BrowseTab.Type

/**
 * Whether the groups are read, the groups, the workspace's members, the person's own admissions, what they may do,
 * the group picked, the browse page's tab and search, the teams being joined, what they are starting and the dialog it
 * is in, with the radio group and the combobox of its form, the groups with activity the person has not read and when
 * they last asked to mark the group open as read, how many notifications wait for them in each group, the turns under
 * way, the workspace's agents, how many times the person asked to read the groups again, and why the last read or write
 * failed.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  isLoaded: Schema.Boolean,
  groups: Schema.Array(GroupItem),
  members: Schema.Array(Member.Member),
  memberships: Schema.Array(GroupMembership.GroupMembership),
  grants: Schema.Array(Grant.Grant),
  selected: Schema.Option(GroupId.GroupId),
  browse: Schema.Struct({ tab: BrowseTab, query: Schema.String }),
  joining: Schema.Array(GroupId.GroupId),
  starting: Schema.Option(Starting),
  dialog: DialogBlock.Model,
  visibilityGroup: VisibilityRadioGroupBlock.Model,
  membersCombobox: MembersComboboxBlock.Model,
  newActivity: Schema.Array(NewActivity),
  readRequested: Schema.Option(NewActivity),
  waiting: Schema.Array(Waiting),
  turns: Schema.Array(ReplicaRecord.Turn),
  agents: Schema.Array(AgentItem),
  reads: Schema.Int,
  notice: Schema.Option(Schema.String)
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ReceivedGroups: {
    groups: Schema.Array(GroupItem),
    members: Schema.Array(Member.Member),
    memberships: Schema.Array(GroupMembership.GroupMembership),
    grants: Schema.Array(Grant.Grant)
  },
  ReceivedSignals: {
    newActivity: Schema.Array(NewActivity),
    waiting: Schema.Array(Waiting),
    turns: Schema.Array(ReplicaRecord.Turn),
    agents: Schema.Array(AgentItem)
  },
  FailedRead: { error: Schema.String },
  ClickedTryAgain: {},
  ClickedGroup: { groupId: GroupId.GroupId },
  InformedOfOpenGroup: { groupId: Schema.Option(GroupId.GroupId) },
  ClickedGroupsTitle: {},
  ClickedBrowse: {},
  ChoseBrowseTab: { tab: BrowseTab },
  TypedBrowseQuery: { query: Schema.String },
  ClickedJoin: { groupId: GroupId.GroupId },
  SucceededJoinGroup: { groupId: GroupId.GroupId },
  FailedJoinGroup: { groupId: GroupId.GroupId, error: Schema.String },
  ClickedNewTeam: {},
  TypedTeamName: { name: Schema.String },
  ClickedRemoveStartingMember: { memberId: Schema.String },
  SubmittedTeam: {},
  SucceededCreateTeam: {},
  FailedCreateTeam: { error: Schema.String },
  CompletedFocusStartingMembers: {},
  ClickedNewConversation: {},
  SubmittedConversation: {},
  ClickedTeammate: { memberId: MemberId.MemberId },
  RequestedConversationWith: { memberId: MemberId.MemberId },
  WroteAction: {},
  FailedWriteAction: { error: Schema.String }
})
export type Message = typeof Message.Type

/**
 * What the Block asks of its parent: to open the group the person picked, to open a conversation with the people the
 * person picked, which they have none with yet, to show the browse page, to confirm that the person joined a group,
 * with where it is as a line says it, "#launches", and to open the team the person created and confirm it.
 */
export const OutMessage = defineMessageUnion({
  SelectedGroup: { groupId: GroupId.GroupId },
  SelectedPeople: { memberIds: Schema.Array(MemberId.MemberId) },
  RequestedBrowse: {},
  JoinedGroup: { groupId: GroupId.GroupId, place: Schema.String },
  CreatedGroup: { groupId: GroupId.GroupId }
})
export type OutMessage = typeof OutMessage.Type

export const GroupsDefinition = Block.makeDefinition("Groups", { Model, Message, OutMessage })

/** Whether the person belongs to `group`: a conversation of theirs, or a team they hold an admission to. */
export const belongsTo = (model: Model, group: Group.Group): boolean =>
  group.kind === "Team"
    ? model.memberships.some((membership) => membership.groupId === group.id)
    : group.memberIds.includes(model.memberId)

/** General first, then by name as the person reads it, in any case and whatever the accents, then by ID. */
export const byGeneralThenName = (model: Pick<Model, "members" | "memberId">): Order.Order<GroupItem> =>
  Order.combineAll([
    Order.mapInput(Order.Boolean, ({ group }: GroupItem) => !Group.isGeneral(group)),
    Order.mapInput(Order.String, ({ group }: GroupItem) =>
      foldAccents(groupName(group, model.members, model.memberId))
    ),
    Order.mapInput(Order.String, ({ group }: GroupItem) => group.id)
  ])

/** The groups the person belongs to, as the sidebar lists them: their teams and their conversations, in order. */
export const yours = (model: Model): ReadonlyArray<GroupItem> =>
  Array.sort(
    model.groups.filter(({ group }) => belongsTo(model, group)),
    byGeneralThenName(model)
  )

/** The teams the person belongs to, in order: what the browse page lists as their groups, with no conversation. */
export const yourTeams = (model: Model): ReadonlyArray<TeamItem> => yours(model).filter(isTeamItem)

/** The group `groupId`, while the person can see it. */
export const findGroup = (model: Model, groupId: GroupId.GroupId): Option.Option<GroupItem> =>
  Array.findFirst(model.groups, ({ group }) => group.id === groupId)

/** Whether the group `groupId` has activity the person has not read. */
export const hasNewActivityIn = (model: Pick<Model, "newActivity">, groupId: GroupId.GroupId): boolean =>
  model.newActivity.some((unread) => unread.groupId === groupId)

/** How many of the person's notifications from the threads of the group `groupId` wait for them. */
export const waitingIn = (model: Pick<Model, "waiting">, groupId: GroupId.GroupId): number =>
  model.waiting.find((waiting) => waiting.groupId === groupId)?.count ?? 0

/**
 * The activity of the group open that the person has not read and has not asked to mark as read: none while the group
 * has none, or once they asked to mark the group read as of the latest activity it has now.
 */
export const unreadInOpenGroup = (
  model: Pick<Model, "selected" | "newActivity" | "readRequested">
): Option.Option<NewActivity> =>
  Option.flatMap(model.selected, (groupId) =>
    Option.filter(
      Array.findFirst(model.newActivity, (unread) => unread.groupId === groupId),
      (unread) =>
        !Option.exists(
          model.readRequested,
          (requested) =>
            requested.groupId === unread.groupId && DateTime.Equivalence(requested.latestAt, unread.latestAt)
        )
    )
  )

/** The public teams the person may join and does not belong to, in order. */
export const discoverable = (model: Model): ReadonlyArray<TeamItem> =>
  Array.sort(
    model.groups.filter(isTeamItem).filter(({ group }) => isJoinable(group) && !belongsTo(model, group)),
    byGeneralThenName(model)
  )

/** The groups of `items` whose name, as the person reads it, contains `query` in any case: all of them for none. */
export const matching = <Item extends GroupItem>(
  model: Model,
  items: ReadonlyArray<Item>,
  query: string
): ReadonlyArray<Item> => {
  const wanted = query.trim().toLowerCase()
  return wanted === ""
    ? items
    : items.filter(({ group }) => groupName(group, model.members, model.memberId).toLowerCase().includes(wanted))
}

/** The conversation of the person with exactly the members `memberIds`, when there is one. */
export const conversationWith = (
  model: Model,
  memberIds: ReadonlyArray<MemberId.MemberId>
): Option.Option<Group.Direct> =>
  conversationAmong(
    model.groups.map(({ group }) => group),
    model.memberId,
    memberIds
  )

/** The workspace's other active members, whom the person may start a conversation with. */
export const others = (model: Model): ReadonlyArray<Member.Member> =>
  model.members.filter((member) => member.id !== model.memberId && member.status === "active")

/**
 * The workspace's other active members the person has no conversation with alone yet, by name as they read it, in any
 * case and whatever the accents: whom the sidebar lists after their conversations, to start one.
 */
export const teammates = (model: Model): ReadonlyArray<Member.Member> =>
  Array.sort(
    others(model).filter(({ id }) => Option.isNone(conversationWith(model, [id]))),
    Order.combine(
      Order.mapInput(Order.String, ({ name }: Member.Member) => foldAccents(name)),
      Order.mapInput(Order.String, ({ id }: Member.Member) => id)
    )
  )

/** The agent whose membership is `memberId`, when the member is one. */
export const findAgentOfMember = (
  model: Pick<Model, "agents">,
  memberId: MemberId.MemberId
): Option.Option<AgentItem> => Array.findFirst(model.agents, ({ agent }) => agent.memberId === memberId)

/** What the agent is doing, from the turns under way, in the places as the person names them. */
export const activityOfAgentHere = (model: Model, item: AgentItem) =>
  activityOfAgent(
    {
      turns: model.turns,
      groups: model.groups.map(({ group }) => group),
      members: model.members,
      memberId: model.memberId
    },
    item
  )

/** What `starting` becomes when the team being started is changed as `change` makes it, if one is. */
export const onTeam = (change: (team: TeamForm) => TeamForm) =>
  Option.map(Starting.matchOrElse({ Team: change }, (same) => same))

/**
 * What `starting` becomes when the members chosen, of the team or of the conversation, are changed as `change` makes
 * them.
 */
export const onMemberIds = (
  change: (memberIds: ReadonlyArray<MemberId.MemberId>) => ReadonlyArray<MemberId.MemberId>
) =>
  Option.map(
    Starting.match({
      Team: (team) => Starting.Team({ ...team, memberIds: change(team.memberIds) }),
      Conversation: ({ memberIds }) => Starting.Conversation({ memberIds: change(memberIds) })
    })
  )

/** The team form changed as `change` makes it, while the person is starting a team. */
export const withTeam = (model: Model, change: (team: TeamForm) => TeamForm): Model =>
  modifyFields(model, { starting: onTeam(change) })

/** The team being started, while one is. */
export const teamIn = (model: Model): Option.Option<TeamForm> =>
  Option.flatMap(
    model.starting,
    Starting.matchOrElse({ Team: (team) => Option.some(team) }, () => Option.none())
  )

/** The members chosen to have the conversation with, while the person is starting one. */
export const conversationIn = (model: Model): Option.Option<ReadonlyArray<MemberId.MemberId>> =>
  Option.flatMap(
    model.starting,
    Starting.matchOrElse({ Conversation: ({ memberIds }) => Option.some(memberIds) }, () => Option.none())
  )

/** Whether the team form can be sent: it has a name, and no attempt to create the team is on its way. */
export const isTeamReady = ({ name, creating }: TeamForm): boolean => name.trim() !== "" && Option.isNone(creating)

/**
 * The team the person created, once the store has kept the action that creates it and has listed it: one they made
 * under the name they sent that they could not see when they sent the form.
 */
export const findCreatedTeam = (model: Model): Option.Option<TeamItem> =>
  Option.flatMap(teamIn(model), ({ creating }) =>
    Option.flatMap(
      Option.filter(creating, ({ isWritten }) => isWritten),
      (sent) =>
        Option.fromUndefinedOr(
          model.groups
            .filter(isTeamItem)
            .find(
              ({ group }) =>
                group.createdBy === model.memberId && group.name === sent.name && !sent.knownGroupIds.includes(group.id)
            )
        )
    )
  )
