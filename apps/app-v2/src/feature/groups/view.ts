import { GroupPermissions } from "@amends-dev/core/group"
import { button, field, iconButton, notice, searchField, submit, textarea, toggle } from "@amends-dev/design/control"
import { badge } from "@amends-dev/design/details"
import { columns, emptyLine, row, statusLine, summary } from "@amends-dev/design/directory"
import { modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { groupName, pluralize } from "../../seen.ts"
import { DialogBinding, GroupsComposition, type GroupsViewBuilder } from "./composition.ts"
import {
  type BrowseTab,
  discoverable,
  type GroupItem,
  matching,
  Message,
  type Model,
  others,
  Starting,
  type TeamItem,
  yours,
  yourTeams
} from "./definition.ts"

/**
 * The title of the thread open in the group open, which the page reads from the group, when one is, and whether the
 * browse page is the destination open, which marks the Groups title current.
 */
export type ViewInputs = Readonly<{ openThread: Option.Option<string>; isBrowsing: boolean }>

/**
 * A group as a row of the sidebar, a team by its mark and a conversation by the first letter of the other
 * member's name, the group picked marked, and under it the thread open in it, when there is one.
 */
const groupRow = (
  { group, pending }: GroupItem,
  model: Model,
  openThread: Option.Option<string>,
  h: GroupsViewBuilder
): Html => {
  const name = groupName(group, model.members, model.memberId)
  const isCurrent = Option.contains(model.selected, group.id)
  return sidebarItem(h, {
    ...(group.kind === "Team" ? { icon: "mark-channel" as const } : { mark: { text: name.slice(0, 1) } }),
    label: name,
    isPending: pending,
    isCurrent,
    onClick: Message.ClickedGroup({ groupId: group.id }),
    ...(isCurrent && Option.isSome(openThread)
      ? { children: [{ icon: "circle-frame" as const, label: openThread.value, isCurrent: true }] }
      : {})
  })
}

/**
 * The modal for what the person is starting: a team, or a conversation with another member. While nothing is being
 * started the dialog has no content to show, so it is an empty frame.
 */
const startingModal = (render: RenderInfo, model: Model, h: GroupsViewBuilder): Html =>
  Option.match(model.starting, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: Starting.match({
      Team: ({ name, isPublic }) =>
        modal(h, render, {
          title: "New team",
          body: [
            field(
              h,
              {
                id: "team-name",
                label: "Team name",
                type: "text",
                value: name,
                onInput: (name) => Message.TypedTeamName({ name }),
                isAutofocus: false,
                attributes: render.initialFocus
              },
              Option.none()
            ),
            toggle(h, {
              id: "team-public",
              label: "Anyone in the workspace can join",
              isOn: isPublic,
              onToggle: (isPublic) => Message.ToggledTeamPublic({ isPublic })
            })
          ],
          cancelLabel: "Cancel",
          footer: [submit(h, "Create team")],
          onSubmit: Message.SubmittedTeam()
        }),
      Conversation: ({ memberId, text }) =>
        modal(h, render, {
          title: "New conversation",
          body: [
            memberChoice(h, {
              id: "conversation-member",
              label: "With",
              none: "Choose a member",
              members: others(model),
              value: memberId,
              onChange: (memberId) => Message.ChoseConversationMember({ memberId }),
              // The dialog opens on the member choice, or, with a member chosen already, on the first message.
              attributes: Option.isNone(memberId) ? render.initialFocus : []
            }),
            textarea(h, {
              id: "conversation-text",
              label: "First message",
              value: text,
              onInput: (text) => Message.TypedConversationText({ text }),
              attributes: Option.isSome(memberId) ? render.initialFocus : []
            })
          ],
          cancelLabel: "Cancel",
          footer: [submit(h, "Start")],
          onSubmit: Message.SubmittedConversation()
        })
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
  openThread: Option.Option<string>,
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
 * which is there whoever else is in the workspace. The Groups title opens the browse page on the teams the person
 * belongs to and is current while it shows; Browse groups opens it on the teams they may join. The buttons that start
 * a team or a conversation open the dialog `dialogView` renders.
 */
export const view = GroupsComposition.makeView.withInputs<ViewInputs>((model, { openThread, isBrowsing }, h) => {
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
      children: conversations.map((item) => groupRow(item, model, openThread, h))
    })
  ])
})

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
      viewInputs: { toView: (render) => startingModal(render, model, h) }
    })
  )
)

/** What each tab of the browse page says over its groups and in its search, and when it has none to list. */
const browseTabs = {
  Yours: {
    copy: "Public and private groups you've joined.",
    placeholder: "Search your groups…",
    listLabel: "Your groups",
    none: "You haven't joined any groups yet."
  },
  Discover: {
    copy: "Public groups you haven't joined. Join one to read its threads.",
    placeholder: "Search public groups…",
    listLabel: "Public groups",
    none: "You've joined every public group."
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
      text: "Can't load the groups.",
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
