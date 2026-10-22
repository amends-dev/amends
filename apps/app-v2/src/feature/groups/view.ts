import { type Group, GroupPermissions } from "@amends-dev/core/group"
import type { Task } from "@amends-dev/core/task"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import {
  announcement,
  button,
  choiceGroup,
  field,
  iconButton,
  notice,
  searchField,
  submit
} from "@amends-dev/design/control"
import { badge } from "@amends-dev/design/details"
import { columns, emptyLine, row, statusLine, summary } from "@amends-dev/design/directory"
import { memberPicker } from "@amends-dev/design/members"
import { modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { type ActivityState, stateInGroup, type AgentItem, readinessOfAgent } from "../../data/agents.ts"
import { groupName } from "../../data/groups.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { motionOfState, stateWord, sidebarActivity, statusOfAgent } from "../../view/agents.ts"
import { pluralize } from "../../view/counts.ts"
import { visibilityHint } from "../../view/groups.ts"
import { includedHint, pickerPeople, pickerPeopleChosen, youInPicker } from "../../view/memberPicker.ts"
import { memberMark } from "../../view/members.ts"
import { statusLabel, statusShape } from "../../view/tasks.ts"
import {
  DialogBinding,
  GroupsComposition,
  type GroupsViewBuilder,
  MembersBinding,
  VisibilityBinding
} from "./composition.ts"
import { conversationMark, soleOtherIn } from "./conversation.ts"
import {
  activityOfAgentHere,
  type BrowseTab,
  discoverable,
  findAgentOfMember,
  conversationWith,
  type GroupItem,
  hasNewActivityIn,
  isTeamReady,
  matching,
  Message,
  type Model,
  others,
  Starting,
  startingMembersId,
  teammates,
  type TeamItem,
  teamVisibilityId,
  waitingIn,
  yours,
  yourTeams
} from "./definition.ts"

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
  h: GroupsViewBuilder
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
  h: GroupsViewBuilder
): Html =>
  sidebarItem(h, {
    mark: memberMark(member),
    ...Option.match(findAgentOfMember(model, member.id), {
      onNone: () => ({}),
      onSome: (item) => standingOfAgent(item, model)
    }),
    label: member.name,
    isCurrent: Option.contains(unsentWith, member.id),
    onClick: Message.ClickedTeammate({ memberId: member.id })
  })

/** What the New message modal says when the people chosen are exactly those of a conversation the person has. */
const existingConversationLine = "You already have a conversation with them."

/**
 * The modal for what the person is starting: a team, or a conversation with the people they choose, which is New
 * message as `apps/ui` has it. A conversation they have with exactly those people is opened, not started, and the modal
 * says so. While nothing is being started the dialog has no content to show, so it is an empty frame.
 */
const startingModal = (render: RenderInfo, model: Model, h: GroupsViewBuilder): Html =>
  Option.match(model.starting, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: Starting.match({
      Team: (team) =>
        modal(h, render, {
          title: "Create group",
          description: "Set a name, visibility, and members.",
          body: [
            field(
              h,
              {
                id: "team-name",
                label: "Group name",
                type: "text",
                value: team.name,
                placeholder: "e.g. release-planning",
                maxLength: 80,
                onInput: (name) => Message.TypedTeamName({ name }),
                isAutofocus: false,
                attributes: render.initialFocus
              },
              Option.none()
            ),
            choiceGroup(h, {
              id: teamVisibilityId,
              label: "Visibility",
              choices: [
                ["Public", "Public"],
                ["Private", "Private"]
              ],
              value: team.visibility,
              hint: visibilityHint[team.visibility],
              embed: (viewInputs) =>
                h.block(
                  VisibilityBinding.embedView({ slotId: "team-visibility", model: model.visibilityGroup, viewInputs })
                )
            }),
            memberPicker(h, {
              id: startingMembersId,
              label: "Members",
              locked: [youInPicker(model.members, model.memberId)],
              chosen: pickerPeopleChosen(model.members, team.memberIds),
              candidates: pickerPeople(others(model)),
              query: model.membersCombobox.inputValue,
              isOpen: model.membersCombobox.isOpen,
              hint: includedHint(team.memberIds.length),
              onRemove: (memberId) => Message.ClickedRemoveStartingMember({ memberId }),
              embed: (viewInputs) =>
                h.block(
                  MembersBinding.embedView({ slotId: "starting-members", model: model.membersCombobox, viewInputs })
                )
            }),
            notice(h, team.failure)
          ],
          cancelLabel: "Cancel",
          footer: [submit(h, "Create group", { isDisabled: !isTeamReady(team) })],
          onSubmit: Message.SubmittedTeam()
        }),
      Conversation: ({ memberIds }) => {
        const hasConversation = Option.isSome(conversationWith(model, memberIds))

        return modal(h, render, {
          title: "New message",
          description: "Everyone you choose sees every thread in your conversation together.",
          size: "compact",
          body: [
            memberPicker(h, {
              id: startingMembersId,
              label: "To",
              placeholder: "Add someone…",
              chosen: pickerPeopleChosen(model.members, memberIds),
              candidates: pickerPeople(others(model)),
              query: model.membersCombobox.inputValue,
              isOpen: model.membersCombobox.isOpen,
              attributes: render.initialFocus,
              onRemove: (memberId) => Message.ClickedRemoveStartingMember({ memberId }),
              embed: (viewInputs) =>
                h.block(
                  MembersBinding.embedView({ slotId: "starting-members", model: model.membersCombobox, viewInputs })
                )
            }),
            announcement(h, hasConversation ? Option.some(existingConversationLine) : Option.none())
          ],
          cancelLabel: "Cancel",
          footer: [
            submit(h, hasConversation ? "Open conversation" : "Start conversation", {
              isDisabled: memberIds.length === 0
            })
          ],
          onSubmit: Message.SubmittedConversation()
        })
      }
    })
  })

/** Whether the person may start a team. */
const mayCreateTeam = (model: Model): boolean =>
  may(model.grants, GroupPermissions.Create, workspaceTarget(model.workspaceId))

/**
 * The Groups section's rows: a row for each team the person belongs to, and, when they belong to none, "No groups yet"
 * once the groups are read, and nothing before.
 */
const teamRows = (
  teams: ReadonlyArray<GroupItem>,
  model: Model,
  openThread: Option.Option<OpenThread>,
  h: GroupsViewBuilder
): ReadonlyArray<Html> => {
  if (teams.length > 0) {
    return teams.map((item) => groupRow(item, model, openThread, h))
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
export const view = GroupsComposition.makeView.withInputs<ViewInputs>(
  (model, { openThread, isBrowsing, unsentWith }, h) => {
    const own = yours(model)
    const teams = own.filter(({ group }) => group.kind === "Team")
    const conversations = own.filter(({ group }) => group.kind !== "Team")

    return sidebarSections(h, [
      notice(h, model.notice),
      sidebarSection(h, {
        label: "Groups",
        onTitleClick: Message.ClickedGroupsTitle(),
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
        children: teamRows(teams, model, openThread, h)
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
          ...conversations.map((item) => groupRow(item, model, openThread, h)),
          ...teammates(model).map((member) => teammateRow(member, model, unsentWith, h))
        ]
      })
    ])
  }
)

/**
 * The dialog for what the person is starting, a team or a conversation, which the page lends the shell: it
 * renders its `dialog` element, with nothing in it while it is closed, wherever the page puts the buttons that
 * open it, the sidebar's and the browse page's, whether or not the sidebar is on the page.
 */
export const dialogView = GroupsComposition.makeView((model, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "starting",
      model: model.dialog,
      viewInputs: { hasDescription: Option.isSome(model.starting), toView: (render) => startingModal(render, model, h) }
    })
  )
)

/** What each tab of the browse page says over its groups and in its search, and when it has none to list. */
const browseTabs = {
  Yours: {
    copy: "Public and private groups you’ve joined.",
    placeholder: "Search your groups…",
    listLabel: "Your groups",
    none: "You haven’t joined any groups yet."
  },
  Discover: {
    copy: "Public groups you haven’t joined. Join one to read its threads.",
    placeholder: "Search public groups…",
    listLabel: "Public groups",
    none: "You’ve joined every public group."
  }
} as const satisfies Record<BrowseTab, unknown>

/** What the teams the tab lists are, before the search narrows them: the person's own, or those they may join. */
const listedOn = (model: Model, tab: BrowseTab): ReadonlyArray<TeamItem> =>
  tab === "Yours" ? yourTeams(model) : discoverable(model)

/**
 * A team as a row of the browse page: the channel's drawing and its name as the person reads it, whether it is public
 * or private, how many members it has, and a way to open it. A team the person may join has a Join button, named for
 * it, which is disabled while it is being joined, in place of Open →.
 */
const browseRow = ({ group, pending, members }: TeamItem, tab: BrowseTab, model: Model, h: GroupsViewBuilder): Html => {
  const memberCount = pluralize(members, "member", "members")

  return h.keyed("li")(
    group.id,
    [],
    [
      row(h, {
        mark: { icon: "mark-channel" },
        title: group.name,
        ...(pending ? { meta: "Sending…" } : {}),
        cells: [badge(h, { label: group.visibility }), h.span([], [memberCount])],
        cellsText: `${group.visibility} · ${memberCount}`,
        ...(tab === "Yours"
          ? { action: "Open →" }
          : {
              button: {
                label: "Join",
                name: `Join #${group.name}`,
                isDisabled: model.joining.includes(group.id),
                onClick: Message.ClickedJoin({ groupId: group.id })
              }
            }),
        onClick: Message.ClickedGroup({ groupId: group.id })
      })
    ]
  )
}

/** Whether the groups could not be read, which is why there are none to show: nothing was read, and why. */
const isUnread = (model: Model): boolean => !model.isLoaded && Option.isSome(model.notice)

/** What a tab says when it lists no group: that the search found none, or that the tab has none. */
const noneListed = (query: string, tab: BrowseTab): string =>
  query.trim() === "" ? browseTabs[tab].none : "No groups match this search."

/**
 * The list of teams, or, in its place, a quiet line: that they are being read, that they could not be, with a way to
 * read them again, or that there are none to list.
 */
const listBody = (shown: ReadonlyArray<TeamItem>, model: Model, h: GroupsViewBuilder): Html => {
  const { tab, query } = model.browse

  if (isUnread(model)) {
    return statusLine(h, {
      text: "Can’t load the groups.",
      action: button(h, "Try again", Message.ClickedTryAgain(), { variant: "quiet" })
    })
  }

  if (!model.isLoaded) {
    return statusLine(h, { text: "Loading groups…" })
  }

  if (shown.length === 0) {
    return emptyLine(h, noneListed(query, tab))
  }

  return h.ul(
    [h.AriaLabel(browseTabs[tab].listLabel)],
    shown.map((item) => browseRow(item, tab, model, h))
  )
}

/** The tab of the browse page `label` names, counted once the groups are read, and chosen by a click. */
const browseTab = (model: Model, tab: BrowseTab, label: string, items: ReadonlyArray<TeamItem>) => ({
  label,
  ...(model.isLoaded ? { count: items.length } : {}),
  isCurrent: model.browse.tab === tab,
  onClick: Message.ChoseBrowseTab({ tab })
})

/**
 * The browse page, the main pane's whole content: the teams the person belongs to and the public teams they may join
 * on a tab each, counted once they are read, the button to start a team where they may, a toolbar with a search that
 * narrows the tab, the line that says what the tab lists, the labels of its columns, which are there while it is
 * empty, being read, or could not be too, and a row for each team, to open, with Join on those they may join. A join
 * that could not be kept says why over the list. The button opens the dialog `dialogView` renders.
 */
export const browseView = GroupsComposition.makeView((model, h) => {
  const { tab, query } = model.browse
  const shown = matching(model, listedOn(model, tab), query)

  return pane(h, {
    variant: "main",
    label: "Groups",
    header: {
      title: "Groups",
      icon: "users",
      actions: mayCreateTeam(model) ? [button(h, "Create group", Message.ClickedNewTeam())] : [],
      tabs: paneTabs(h, {
        label: "Groups",
        tabs: [
          browseTab(model, "Yours", "Your groups", yourTeams(model)),
          browseTab(model, "Discover", "Discover", discoverable(model))
        ]
      })
    },
    toolbar: [
      paneToolbar(h, {
        start: [
          searchField(h, {
            id: "browse-groups",
            label: "Search groups",
            placeholder: browseTabs[tab].placeholder,
            value: query,
            onInput: (query) => Message.TypedBrowseQuery({ query })
          })
        ]
      }),
      summary(h, {
        copy: browseTabs[tab].copy,
        count: model.isLoaded ? pluralize(shown.length, "group", "groups") : ""
      }),
      columns(h, { label: "Group", cells: ["Visibility", "Members"] })
    ],
    body: [
      paneColumn(h, [isUnread(model) ? h.empty : notice(h, model.notice), listBody(shown, model, h)], { isWide: true })
    ]
  })
})
