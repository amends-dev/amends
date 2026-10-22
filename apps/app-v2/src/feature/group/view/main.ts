/** The group’s main pane, its threads, and the controls that open settings. */

import { button, hint, iconButton, notice } from "@amends-dev/design/control"
import { markStack } from "@amends-dev/design/mark"
import { pane, paneColumn, paneEmpty } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { isJoinable } from "../../../data/groups.ts"
import { memberName } from "../../../data/members.ts"
import { pluralize } from "../../../view/counts.ts"
import { showsConversation } from "../../threads/definition.ts"
import {
  cantLoadConversation,
  composerView,
  tabsView,
  toolbarView,
  type ViewInputs as ThreadsViewInputs,
  view as threadsView
} from "../../threads/view/list.ts"
import { selfName } from "../../threads/view/wording.ts"
import { GroupBlock } from "../block.ts"
import { DialogBinding, type GroupViewBuilder, ThreadsBinding } from "../composition.ts"
import {
  type Availability,
  availabilityOf,
  belongs,
  isFollowChanging,
  isFollowing,
  Message,
  type Model,
  membersOf,
  slashCommandsOf,
  teamName
} from "../definition.ts"
import { settingsModal } from "./dialog.ts"
import { nameOf, markOfMember } from "./identity.ts"

/**
 * The time now, which the days the threads and their messages were published on are read from, the workspace's name,
 * which a phone shows under the group's title, the window's width, which decides whether the settings add members
 * in a field or, on a phone, in a view of their own, and the trigger whose member's card is open.
 */
export type ViewInputs = Readonly<{
  now: DateTime.Utc
  workspaceName: string
  viewport: Viewport
  openTriggerId: string | undefined
}>

/** What marks the group in its title: a team's drawing of a channel, and a conversation's of a message. */
const iconOf = (model: Model): "mark-channel" | "message" =>
  Option.exists(model.group, ({ group }) => group.kind !== "Team") ? "message" : "mark-channel"

/**
 * The person's follow of the group as a bell, named Follow and Following: filled and pressed while they follow it,
 * which stops following, and unavailable while a change to it is on its way.
 */
const followAction = (model: Model, h: GroupViewBuilder): Html => {
  const isPending = isFollowChanging(model)

  return isFollowing(model)
    ? iconButton(
        h,
        { icon: "bell-filled", label: "Following", onClick: Message.ClickedUnfollow() },
        { isPressed: true, isDisabled: isPending }
      )
    : iconButton(
        h,
        { icon: "bell", label: "Follow", onClick: Message.ClickedFollow() },
        { isPressed: false, isDisabled: isPending }
      )
}

/** The person's part in the group: following it while they belong to it, joining a public team while they do not. */
const partActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> =>
  Option.match(model.group, {
    onNone: () => [],
    onSome: ({ group }) =>
      belongs(model)
        ? [followAction(model, h)]
        : isJoinable(group)
          ? [button(h, "Join", Message.ClickedJoin(), { variant: "primary" })]
          : []
  })

/**
 * The button that opens the search, named Search, which a phone's header has, since the rail with its Search is in the
 * drawer there, and only for a group the person belongs to, as the bell is.
 */
const searchActions = (model: Model, viewport: Viewport, h: GroupViewBuilder): ReadonlyArray<Html> =>
  viewport === "Phone" && belongs(model)
    ? [iconButton(h, { icon: "mark-search", label: "Search", onClick: Message.ClickedSearch() })]
    : []

/** How many of the group's members the stack in its header shows. */
const stackedMembers = 3

/**
 * The members of the group as a stack of their first few marks that opens them, named for how many there are, once the
 * group is read and has any.
 */
const membersActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> => {
  const memberIds = membersOf(model)

  return memberIds.length === 0
    ? []
    : [
        markStack(h, {
          marks: memberIds.slice(0, stackedMembers).map((memberId) => markOfMember(model, memberId)),
          label: pluralize(memberIds.length, "member", "members"),
          onClick: Message.ClickedMembers()
        })
      ]
}

/** The names of a team's members as its welcome says them: the person as `selfName`, first, and the others by name. */
const welcomeNames = (model: Model): ReadonlyArray<string> => {
  const memberIds = membersOf(model)

  return [
    ...(memberIds.includes(model.memberId) ? [selfName] : []),
    ...memberIds
      .filter((memberId) => memberId !== model.memberId)
      .map((memberId) => memberName(model.members, memberId))
  ]
}

/** The button that opens the group's settings, once the group is read. */
const settingsActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> =>
  Option.isSome(model.group)
    ? [iconButton(h, { icon: "mark-settings", label: "Group settings", onClick: Message.ClickedSettings() })]
    : []

/**
 * What the group says when the person's replica lacks it, as it does for a group they never had or can no longer read.
 */
const unavailableGroup = (h: GroupViewBuilder): Html =>
  paneEmpty(h, {
    art: "held-back",
    title: "This group isn’t available",
    copy: "You may no longer be a member of it."
  })

/**
 * What the main pane's column holds: the group's threads, or the tasks they track; why there are none to show, that
 * the group is not available or could not be read; or, for a public team the person has not joined, the line that says
 * to join it.
 */
const columnOf = (
  model: Model,
  availability: Availability,
  isReadable: boolean,
  threadsInputs: ThreadsViewInputs,
  h: GroupViewBuilder
): ReadonlyArray<Html> => {
  if (availability === "Unavailable") {
    return [unavailableGroup(h)]
  }

  if (availability === "Failed") {
    return [cantLoadConversation(h, Message.ClickedTryAgain())]
  }

  return [
    notice(h, model.notice),
    isReadable
      ? h.block(
          ThreadsBinding.embedView({
            slotId: "threads",
            model: model.threads,
            viewInputs: threadsInputs,
            view: threadsView
          })
        )
      : hint(h, "Join this team to read its threads.")
  ]
}

/**
 * The group's main pane: its name, titled by its mark, a channel for a team and a message for a conversation, with the
 * workspace's name under it on a phone, and its members, the person's part in it, on a phone the button to open the
 * search, and the button to open its settings,
 * under the tabs of its threads and its tasks, named for the group, and the tab shown, with the composer to start
 * one in the footer, or the line that says to join the team to read them; or, in place of both, that the group is not
 * available or could not be read; and the settings' modal.
 */
export const view = GroupBlock.makeView.withInputs<ViewInputs>((model, inputs, h) => {
  const { now, workspaceName, viewport, openTriggerId } = inputs
  const name = nameOf(model)
  const availability = availabilityOf(model)
  // Until the group is read, and when it could not be, its threads list as they would for a member.
  const isReadable = availability !== "Unavailable" && (Option.isNone(model.group) || belongs(model))
  const threadsInputs = {
    members: model.members,
    groupName: name,
    isTeam: Option.isSome(teamName(model)),
    memberNames: welcomeNames(model),
    openThreadId: Option.map(model.thread, ({ threadId }) => threadId),
    openTriggerId,
    present: model.present,
    now,
    commands: slashCommandsOf(model)
  }

  return pane(h, {
    variant: "main",
    label: name,
    header: {
      title: name,
      icon: iconOf(model),
      phoneContext: workspaceName,
      actions: [
        ...membersActions(model, h),
        ...partActions(model, h),
        ...searchActions(model, viewport, h),
        ...settingsActions(model, h)
      ],
      ...(isReadable
        ? {
            tabs: h.block(
              ThreadsBinding.embedView({
                slotId: "tabs",
                model: model.threads,
                view: tabsView,
                viewInputs: { groupName: name }
              })
            )
          }
        : {})
    },
    ...(isReadable && model.threads.tab === "Tasks"
      ? {
          toolbar: [
            h.block(
              ThreadsBinding.embedView({
                slotId: "tasks-toolbar",
                model: model.threads,
                view: toolbarView,
                viewInputs: threadsInputs
              })
            )
          ]
        }
      : {}),
    anchor: isReadable && availability !== "Failed" && showsConversation(model.threads) ? "bottom" : "top",
    body: [
      paneColumn(h, columnOf(model, availability, isReadable, threadsInputs, h), { isWide: true }),
      h.block(
        DialogBinding.embedView({
          slotId: "settings",
          model: model.dialog,
          viewInputs: { toView: (render) => settingsModal(render, model, viewport, h) }
        })
      )
    ],
    ...(isReadable
      ? {
          footer: [
            h.block(
              ThreadsBinding.embedView({
                slotId: "threads-composer",
                model: model.threads,
                viewInputs: threadsInputs,
                view: composerView
              })
            )
          ]
        }
      : {})
  })
})
