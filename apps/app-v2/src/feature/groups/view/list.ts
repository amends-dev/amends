/** The groups the person has joined and can discover. */

import { button, notice, searchField } from "@amends-dev/design/control"
import { badge } from "@amends-dev/design/details"
import { columns, emptyLine, row, statusLine, summary } from "@amends-dev/design/directory"
import { pane, paneColumn, paneTabs, paneToolbar } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { pluralize } from "../../../view/counts.ts"
import { GroupsBlock } from "../block.ts"
import type { GroupsViewBuilder } from "../composition.ts"
import {
  mayCreateTeam,
  type BrowseTab,
  discoverable,
  matching,
  Message,
  type Model,
  type TeamItem,
  yourTeams
} from "../definition.ts"

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
export const view = GroupsBlock.makeView((model, h) => {
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
