/** The groups and conversations in the workspace sidebar. */

import type { Group, GroupId } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import { iconButton, notice } from "@amends-dev/design/control"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { type ActivityState, stateInGroup, type AgentItem, readinessOfAgent } from "../../../data/agents.ts"
import { groupName, soleOtherIn } from "../../../data/groups.ts"
import { motionOfState, stateWord, sidebarActivity, statusOfAgent } from "../../../view/agents.ts"
import { conversationMark } from "../../../view/groups.ts"
import { memberMark } from "../../../view/members.ts"
import { statusLabel, statusShape } from "../../../view/tasks.ts"
import { GroupsBlock } from "../block.ts"
import type { GroupsViewBuilder } from "../composition.ts"
import {
  mayCreateTeam,
  activityOfAgentHere,
  findAgentOfMember,
  type GroupItem,
  hasNewActivityIn,
  Message,
  type Model,
  teammates,
  waitingIn,
  yours
} from "../definition.ts"

/**
 * The thread open in the group open, which the page reads from the group, when one is: its title, and the status of
 * the task it tracks, when it tracks one.
 */
export type OpenThread = Readonly<{ title: string; taskStatus: Option.Option<Task.Status> }>

/**
 * The thread open in the group open, whether the browse page is the destination open, which marks the Groups title
 * current, and the member the conversation not started is with, when one is open and it is with one alone, which marks
 * their row current.
 */
export type ViewInputs = Readonly<{
  groupHref?: ((id: GroupId.GroupId) => string | undefined) | undefined
  memberHref?: ((id: MemberId.MemberId) => string | undefined) | undefined
  browseHref?: string | undefined
  openThread: Option.Option<OpenThread>
  isBrowsing: boolean
  unsentWith: Option.Option<MemberId.MemberId>
}>

/**
 * The thread open as the row under its group draws it: the drawing of the status of the task it tracks, which the
 * status's word goes with, or, when it tracks none, the message icon.
 */
const openThreadRow = ({ title, taskStatus }: OpenThread) => ({
  ...Option.match(taskStatus, {
    onNone: () => ({ icon: "message" as const }),
    onSome: (status) => ({ taskStatus: { shape: statusShape[status], label: statusLabel[status] } })
  }),
  label: title,
  isCurrent: true
})

/** What counts the notifications that wait for the person in a group, as `apps/ui` says it. */
const waitingCountName = "for you"

/** What a row of the sidebar says of an agent being at work in the group, and how the logo moves as its state does. */
const groupActivity = (state: ActivityState) => ({ activity: stateWord[state], activityMotion: motionOfState[state] })

/** What a row says of an agent being at work in the group `groupId`, while one is. */
const activityInGroup = (model: Model, groupId: Group.Group["id"]) =>
  Option.match(stateInGroup(model.turns, groupId), { onNone: () => ({}), onSome: groupActivity })

/** How an agent stands and what it is doing, as the patch on its mark and the logo at the end of its row say it. */
const standingOfAgent = (item: AgentItem, model: Model) => {
  const activity = activityOfAgentHere(model, item)

  return { status: statusOfAgent(readinessOfAgent(item), activity), ...sidebarActivity(activity) }
}

/** What marks a team's row: the channel's drawing, and the logo while an agent is at work in the team. */
const teamLook = (group: Group.Team, model: Model) => ({
  icon: "mark-channel" as const,
  ...activityInGroup(model, group.id)
})

/**
 * What marks a conversation's row: the mark of who it is with, as `conversationMark` says. A conversation with an
 * agent says what the agent is doing wherever it is, and how it stands, as the agents' section does; any other says
 * whether an agent is at work in the conversation itself.
 */
const conversationLook = (group: Group.Direct, model: Model) => {
  const mark = conversationMark(model.members, group, model.memberId)

  return Option.match(
    Option.flatMap(soleOtherIn(group, model.memberId), (memberId) => findAgentOfMember(model, memberId)),
    {
      onNone: () => ({ mark, ...activityInGroup(model, group.id) }),
      onSome: (item) => ({ mark, ...standingOfAgent(item, model) })
    }
  )
}

/**
 * A group as a row of the sidebar: a team by the channel's drawing and a conversation by the mark of who it is with,
 * the group picked marked, and under it the thread open in it, when there is one. What waits for the person in it is a
 * count, read as "2 for you", or, with none, a dot while it has activity they have not read; the logo moves while an
 * agent is at work, as `teamLook` and `conversationLook` say.
 */
const groupRow = (
  { group, pending }: GroupItem,
  model: Model,
  openThread: Option.Option<OpenThread>,
  h: GroupsViewBuilder,
  groupHref?: ViewInputs["groupHref"]
): Html => {
  const isCurrent = Option.contains(model.selected, group.id)
  const waiting = waitingIn(model, group.id)

  return sidebarItem(h, {
    ...(group.kind === "Team" ? teamLook(group, model) : conversationLook(group, model)),
    label: groupName(group, model.members, model.memberId),
    ...(waiting > 0 ? { count: waiting, countName: waitingCountName } : {}),
    isUnread: hasNewActivityIn(model, group.id),
    isPending: pending,
    isCurrent,
    href: groupHref?.(group.id),
    onClick: Message.ClickedGroup({ groupId: group.id }),
    ...(isCurrent && Option.isSome(openThread) ? { children: [openThreadRow(openThread.value)] } : {})
  })
}

/**
 * A member the person has no conversation with yet as a row of the sidebar, by their mark in their tone and their name;
 * an agent says how it stands and what it is doing, as in a conversation with it. The row opens the conversation, and
 * is current while the conversation with them that is not started is what the main pane shows.
 */
const teammateRow = (
  member: Member.Member,
  model: Model,
  unsentWith: Option.Option<MemberId.MemberId>,
  h: GroupsViewBuilder,
  memberHref?: ViewInputs["memberHref"]
): Html =>
  sidebarItem(h, {
    mark: memberMark(member),
    ...Option.match(findAgentOfMember(model, member.id), {
      onNone: () => ({}),
      onSome: (item) => standingOfAgent(item, model)
    }),
    label: member.name,
    isCurrent: Option.contains(unsentWith, member.id),
    href: memberHref?.(member.id),
    onClick: Message.ClickedTeammate({ memberId: member.id })
  })

/**
 * The Groups section's rows: a row for each team the person belongs to, and, when they belong to none, "No groups yet"
 * once the groups are read, and nothing before.
 */
const teamRows = (
  teams: ReadonlyArray<GroupItem>,
  model: Model,
  openThread: Option.Option<OpenThread>,
  h: GroupsViewBuilder,
  groupHref?: ViewInputs["groupHref"]
): ReadonlyArray<Html> => {
  if (teams.length > 0) {
    return teams.map((item) => groupRow(item, model, openThread, h, groupHref))
  }

  return model.isLoaded ? [sidebarEmpty(h, "No groups yet")] : []
}

/**
 * The sidebar's sections of the groups, in the order `yours` gives them: the teams the person belongs to, with Browse
 * groups and, where they may start a team, Create group beside the title, and their conversations, with New message,
 * which is there whoever else is in the workspace, and, after the conversations, the members they have none with yet,
 * by name, each of which opens the dialog with them chosen. The Groups title opens the browse page on the teams the
 * person belongs to and is current while it shows; Browse groups opens it on the teams they may join. The buttons that
 * start a team or a conversation open the dialog `dialogView` renders.
 */
export const sidebarView = GroupsBlock.makeView.withInputs<ViewInputs>(
  (model, { openThread, isBrowsing, unsentWith, groupHref, memberHref, browseHref }, h) => {
    const own = yours(model)
    const teams = own.filter(({ group }) => group.kind === "Team")
    const conversations = own.filter(({ group }) => group.kind !== "Team")

    return sidebarSections(h, [
      notice(h, model.notice),
      sidebarSection(h, {
        label: "Groups",
        onTitleClick: Message.ClickedGroupsTitle(),
        titleHref: browseHref,
        isTitleCurrent: isBrowsing,
        actions: [
          iconButton(
            h,
            { icon: "mark-search", label: "Browse groups", onClick: Message.ClickedBrowse() },
            { size: "compact" }
          ),
          ...(mayCreateTeam(model)
            ? [
                iconButton(
                  h,
                  { icon: "mark-new", label: "Create group", onClick: Message.ClickedNewTeam() },
                  { size: "compact" }
                )
              ]
            : [])
        ],
        children: teamRows(teams, model, openThread, h, groupHref)
      }),
      sidebarSection(h, {
        label: "Direct messages",
        actions: [
          iconButton(
            h,
            { icon: "mark-new", label: "New message", onClick: Message.ClickedNewConversation() },
            { size: "compact" }
          )
        ],
        children: [
          ...conversations.map((item) => groupRow(item, model, openThread, h, groupHref)),
          ...teammates(model).map((member) => teammateRow(member, model, unsentWith, h, memberHref))
        ]
      })
    ])
  }
)
