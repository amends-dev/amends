import { GroupPermissions } from "@amends-dev/core/group"
import { button, column, field, iconButton, notice, submit, textarea, toggle } from "@amends-dev/design/control"
import { badge } from "@amends-dev/design/details"
import { columns, row, summary } from "@amends-dev/design/directory"
import { modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneEmpty, paneTabs } from "@amends-dev/design/pane"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { groupMark, groupName, pluralize } from "../../seen.ts"
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
  yours
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
 * The sidebar's sections of the groups: the teams the person belongs to, their conversations, and the public
 * teams they may join. The Groups title opens the browse page and is current while it shows. The buttons that start
 * a team or a conversation open the dialog `dialogView` renders.
 */
export const view = GroupsComposition.makeView.withInputs<ViewInputs>((model, { openThread, isBrowsing }, h) => {
  const own = yours(model)
  const teams = own.filter(({ group }) => group.kind === "Team")
  const conversations = own.filter(({ group }) => group.kind !== "Team")
  const joinable = discoverable(model)

  return sidebarSections(h, [
    notice(h, model.notice),
    sidebarSection(h, {
      label: "Groups",
      onTitleClick: Message.ClickedBrowse(),
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
                { icon: "mark-new", label: "New team", onClick: Message.ClickedNewTeam() },
                { size: "compact" }
              )
            ]
          : [])
      ],
      children:
        teams.length === 0
          ? [sidebarEmpty(h, "No groups yet")]
          : teams.map((item) => groupRow(item, model, openThread, h))
    }),
    sidebarSection(h, {
      label: "Direct messages",
      actions:
        others(model).length === 0
          ? []
          : [
              iconButton(
                h,
                { icon: "mark-new", label: "New conversation", onClick: Message.ClickedNewConversation() },
                { size: "compact" }
              )
            ],
      children:
        conversations.length === 0
          ? [sidebarEmpty(h, "No messages yet")]
          : conversations.map((item) => groupRow(item, model, openThread, h))
    }),
    joinable.length === 0
      ? h.empty
      : sidebarSection(h, {
          label: "Other teams",
          children: joinable.map((item) => groupRow(item, model, openThread, h))
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

/** What each tab of the browse page says over its groups, and when it has none to list. */
const browseTabs = {
  Yours: {
    copy: "Public and private groups you've joined.",
    placeholder: "Search your groups…",
    none: { art: "sew-in", title: "No groups yet", copy: "The groups you join are listed here." }
  },
  Discover: {
    copy: "Public groups you can join.",
    placeholder: "Search groups to join…",
    none: { art: "rest", title: "Nothing to discover", copy: "Every public group is one you're in." }
  }
} as const satisfies Record<BrowseTab, unknown>

/** What the groups the tab lists are, before the search narrows them. */
const listedOn = (model: Model, tab: BrowseTab): ReadonlyArray<GroupItem> =>
  tab === "Yours" ? yours(model) : discoverable(model)

/**
 * A group as a row of the browse page: a team by `#` and a conversation by the first letters of the other
 * members' names, with whether it is public, private, or direct, how many members it has, and a way to open it.
 */
const browseRow = ({ group, pending, members }: GroupItem, model: Model, h: GroupsViewBuilder): Html => {
  const name = groupName(group, model.members, model.memberId)
  const visibility = group.kind === "Team" ? group.visibility : "Direct"
  const memberCount = pluralize(members, "member", "members")

  return h.keyed("li")(
    group.id,
    [],
    [
      row(h, {
        mark: { text: groupMark(group, name) },
        title: name,
        ...(pending ? { meta: "Sending…" } : {}),
        cells: [badge(h, { label: visibility }), h.span([], [memberCount])],
        cellsText: `${visibility} · ${memberCount}`,
        action: "Open →",
        onClick: Message.ClickedGroup({ groupId: group.id })
      })
    ]
  )
}

/**
 * The browse page, the main pane's whole content: the groups the person belongs to and the public teams they
 * may join on a tab each, with how many, the button to start a team where they may, a search that narrows the
 * tab, and a row for each group, to open. The button opens the dialog `dialogView` renders.
 */
export const browseView = GroupsComposition.makeView((model, h) => {
  const { tab, query } = model.browse
  const shown = matching(model, listedOn(model, tab), query)
  const none =
    query.trim() === ""
      ? browseTabs[tab].none
      : ({ art: "nothing-here", title: "No groups match", copy: `Nothing matches "${query}".` } as const)

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
          {
            label: "Your groups",
            count: yours(model).length,
            isCurrent: tab === "Yours",
            onClick: Message.ChoseBrowseTab({ tab: "Yours" })
          },
          {
            label: "Discover",
            count: discoverable(model).length,
            isCurrent: tab === "Discover",
            onClick: Message.ChoseBrowseTab({ tab: "Discover" })
          }
        ]
      })
    },
    body: [
      paneColumn(
        h,
        [
          notice(h, model.notice),
          column(h, [
            field(
              h,
              {
                id: "browse-groups",
                label: "Search groups",
                type: "search",
                value: query,
                onInput: (query) => Message.TypedBrowseQuery({ query }),
                placeholder: browseTabs[tab].placeholder,
                isAutofocus: false,
                isLabelHidden: true
              },
              Option.none()
            ),
            summary(h, { copy: browseTabs[tab].copy, count: pluralize(shown.length, "group", "groups") }),
            ...(shown.length === 0
              ? [paneEmpty(h, none)]
              : [
                  columns(h, { label: "Group", cells: ["Visibility", "Members"] }),
                  h.ul(
                    [h.AriaLabel("Groups")],
                    shown.map((item) => browseRow(item, model, h))
                  )
                ])
          ])
        ],
        { isWide: true }
      )
    ]
  })
})
