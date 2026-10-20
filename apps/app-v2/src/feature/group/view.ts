import { Group, GroupMembershipPermissions } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import {
  button,
  buttonRow,
  field,
  fieldGrid,
  hint,
  iconButton,
  notice,
  sending,
  submit
} from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import { form, settingRow } from "@amends-dev/design/form"
import { type MarkContent, markStack } from "@amends-dev/design/mark"
import { type ModalConfig, modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneEmpty, paneTabs } from "@amends-dev/design/pane"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { groupTarget, may } from "../../permissions.ts"
import { groupName, initials, isJoinable, memberMark, memberName, pluralize } from "../../seen.ts"
import { followView, replyView, sidePane } from "../thread/view.ts"
import {
  cantLoadConversation,
  composerView,
  tabsView,
  toolbarView,
  type ViewInputs as ThreadsViewInputs
} from "../threads/view.ts"
import { DialogBinding, GroupComposition, type GroupViewBuilder, ThreadBinding, ThreadsBinding } from "./composition.ts"
import {
  admitted,
  type Availability,
  availabilityOf,
  belongs,
  mayRename,
  Message,
  type Model,
  membersOf,
  teamName
} from "./definition.ts"

/**
 * The time now, which the days the threads and their messages were published on are read from, and the workspace's
 * name, which a phone shows under the group's title.
 */
export type ViewInputs = Readonly<{ now: DateTime.Utc; workspaceName: string }>

/** The time now, which the days the thread's messages were published on are read from. */
export type ThreadViewInputs = Readonly<{ now: DateTime.Utc }>

/** Whether `memberId` has the workspace open now. */
const isPresent = (model: Model, memberId: MemberId.MemberId): boolean =>
  model.present.some((present) => present.memberId === memberId)

/** The group's name: a team's own, or a conversation's other members, once the group is read. */
const nameOf = (model: Model): string =>
  Option.match(model.group, {
    onNone: () => "A group",
    onSome: ({ group }) => groupName(group, model.members, model.memberId)
  })

/** What marks the group in its title: a team's drawing of a channel, and a conversation's of a message. */
const iconOf = (model: Model): "mark-channel" | "message" =>
  Option.exists(model.group, ({ group }) => group.kind !== "Team") ? "message" : "mark-channel"

/**
 * The person's follow of the group as a bell, named Follow and Following: filled and pressed while they follow it,
 * which stops following, and unavailable while a change to it is on its way.
 */
const followAction = (model: Model, h: GroupViewBuilder): Html => {
  const isFollowing = Option.exists(model.follow, ({ follow }) => follow.status === "active")
  const isPending = Option.exists(model.follow, ({ pending }) => pending)

  return isFollowing
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

/** How many of the group's members the stack in its header shows. */
const stackedMembers = 3

/** `memberId`'s mark in their tone, or their initials until the workspace's members are read. */
const markOfMember = (model: Model, memberId: MemberId.MemberId): MarkContent => {
  const member = model.members.find(({ id }) => id === memberId)

  return member === undefined ? { text: initials(memberId) } : memberMark(member)
}

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

/** The names of a team's members as its welcome says them: the person as "You", first, and the others by name. */
const welcomeNames = (model: Model): ReadonlyArray<string> => {
  const memberIds = membersOf(model)

  return [
    ...(memberIds.includes(model.memberId) ? ["You"] : []),
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

/** What a section of the settings gives the modal: its body, and the footer's action and submit that go with it. */
type SettingsPanel = Pick<ModalConfig<Message>, "body" | "footer" | "onSubmit">

/** The person's membership of the group in words, with the way to join or leave where there is one. */
const membershipSetting = (group: Group.Group, model: Model, h: GroupViewBuilder): Html => {
  if (group.kind !== "Team") {
    return settingRow(h, { label: "Membership", copy: "A conversation between its members." })
  }

  if (Group.isGeneral(group)) {
    return settingRow(h, { label: "Membership", copy: "Everyone in the workspace belongs to general." })
  }

  return belongs(model)
    ? settingRow(h, {
        label: "Membership",
        copy: "You're a member of this group.",
        action: button(h, "Leave", Message.ClickedLeave())
      })
    : settingRow(h, {
        label: "Membership",
        copy: "You're not a member.",
        action: isJoinable(group) ? button(h, "Join", Message.ClickedJoin(), { variant: "primary" }) : undefined
      })
}

/**
 * The General section: the group's name, a field for someone who may rename the team and its Save changes in
 * the footer, a team's visibility in words, and the person's membership.
 */
const generalPanel = (group: Group.Group, model: Model, render: RenderInfo, h: GroupViewBuilder): SettingsPanel => {
  const name = nameOf(model)
  const draft = Option.getOrElse(model.renaming, () => name)
  const mayRenameTeam = mayRename(model)
  return {
    body: [
      ...(mayRenameTeam
        ? [
            field(
              h,
              {
                id: "group-name",
                label: "Group name",
                type: "text",
                value: draft,
                onInput: (name) => Message.TypedName({ name }),
                hint: "Everyone in this group sees this name.",
                isAutofocus: false,
                attributes: render.initialFocus
              },
              Option.none()
            )
          ]
        : [settingRow(h, { label: "Group name", copy: name })]),
      group.kind === "Team"
        ? settingRow(h, {
            label: "Visibility",
            copy:
              group.visibility === "Public"
                ? "Public. Anyone in the workspace can join."
                : "Private. Members are admitted by the group."
          })
        : h.empty,
      membershipSetting(group, model, h)
    ],
    ...(mayRenameTeam
      ? { footer: [submit(h, "Save changes", { isDisabled: draft === name })], onSubmit: Message.SubmittedRename() }
      : {})
  }
}

/**
 * The Members section: a team's members, and for a member of it who may manage them, removing them and admitting
 * another member, except to general, which every member belongs to.
 */
const membersPanel = (model: Model, h: GroupViewBuilder): SettingsPanel => {
  const admissions = admitted(model)
  const isManaged =
    belongs(model) &&
    !Group.isGeneral({ id: model.groupId }) &&
    may(model.grants, GroupMembershipPermissions.Manage, groupTarget(model.workspaceId, model.groupId))
  const admissible = model.members.filter(
    (member) =>
      member.id !== model.memberId &&
      member.status === "active" &&
      !admissions.some(({ membership }) => membership.memberId === member.id)
  )
  return {
    body: [
      entryList(h, {
        label: "Members",
        children: admissions.map(({ membership, pending }) => {
          const name = memberName(model.members, membership.memberId)
          return entry(h, {
            key: membership.id,
            mark: initials(name),
            title: name,
            trailing: [
              isPresent(model, membership.memberId) ? badge(h, { label: "Online", tone: "success" }) : h.empty,
              sending(h, pending)
            ],
            children:
              !isManaged || pending || membership.memberId === model.memberId
                ? []
                : [
                    buttonRow(h, [
                      button(h, "Remove", Message.ClickedRemoveMember({ membershipId: membership.id }), {
                        variant: "quiet"
                      })
                    ])
                  ]
          })
        })
      }),
      !isManaged || admissible.length === 0
        ? h.empty
        : form(h, { onSubmit: Message.SubmittedAdmit(), label: "Add a member", variant: "pane" }, [
            fieldGrid(h, [
              memberChoice(h, {
                id: "admit-member",
                label: "Add a member",
                none: "Choose a member",
                members: admissible,
                value: model.admitting,
                onChange: (memberId) => Message.ChoseMemberToAdmit({ memberId })
              })
            ]),
            buttonRow(h, [submit(h, "Add")])
          ])
    ]
  }
}

/** The settings' sections as tabs, the Members with how many are admitted. */
const settingsTabs = (model: Model, h: GroupViewBuilder): Html =>
  paneTabs(h, {
    label: "Group settings",
    tabs: [
      {
        label: "General",
        isCurrent: model.settingsTab === "General",
        onClick: Message.ChoseSettingsTab({ tab: "General" })
      },
      {
        label: "Members",
        count: admitted(model).length,
        isCurrent: model.settingsTab === "Members",
        onClick: Message.ChoseSettingsTab({ tab: "Members" })
      }
    ]
  })

/**
 * The modal for the group's settings, with the group's name as its context: the General section, and, for a team,
 * its Members section, in tabs. While the group is not read the dialog has no content to show, so it is an empty
 * frame.
 */
const settingsModal = (render: RenderInfo, model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.group, {
    onNone: () => modal(h, render, { title: "Group settings", body: [] }),
    onSome: ({ group }) => {
      const isTeam = group.kind === "Team"
      const panel =
        isTeam && model.settingsTab === "Members" ? membersPanel(model, h) : generalPanel(group, model, render, h)
      return modal(h, render, {
        title: "Group settings",
        context: isTeam ? `# ${nameOf(model)}` : nameOf(model),
        width: "wide",
        ...(isTeam ? { tabs: settingsTabs(model, h) } : {}),
        cancelLabel: isTeam && model.settingsTab === "General" ? "Cancel" : "Done",
        ...panel
      })
    }
  })

/** What the group says when the person's replica lacks it, as it does for a group they never had or can no longer read. */
const unavailableGroup = (h: GroupViewBuilder): Html =>
  paneEmpty(h, {
    art: "held-back",
    title: "This group isn't available",
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
      ? h.block(ThreadsBinding.embedView({ slotId: "threads", model: model.threads, viewInputs: threadsInputs }))
      : hint(h, "Join this team to read its threads.")
  ]
}

/**
 * The group's main pane: its name, titled by its mark, a channel for a team and a message for a conversation, with the
 * workspace's name under it on a phone, and its members, the person's part in it, and the button to open its settings,
 * under the tabs of its threads and its tasks, named for the group, and the tab shown, with the composer to start
 * one in the footer, or the line that says to join the team to read them; or, in place of both, that the group is not
 * available or could not be read; and the settings' modal.
 */
export const view = GroupComposition.makeView.withInputs<ViewInputs>((model, { now, workspaceName }, h) => {
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
    now
  }

  return pane(h, {
    variant: "main",
    label: name,
    header: {
      title: name,
      icon: iconOf(model),
      phoneContext: workspaceName,
      actions: [...membersActions(model, h), ...partActions(model, h), ...settingsActions(model, h)],
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
    body: [
      paneColumn(h, columnOf(model, availability, isReadable, threadsInputs, h), { isWide: true }),
      h.block(
        DialogBinding.embedView({
          slotId: "settings",
          model: model.dialog,
          viewInputs: { toView: (render) => settingsModal(render, model, h) }
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

/**
 * The thread open in the group as the side pane (see `sidePane`), a task's when the thread tracks one, with the button
 * that closes it, Close beside the title and Back before it on a phone, which goes back to the Tasks tab when the
 * tasks are what the group lists, and to the group otherwise. Nothing while none is open.
 */
export const threadView = GroupComposition.makeView.withInputs<ThreadViewInputs>((model, { now }, h) =>
  Option.match(model.thread, {
    onNone: () => h.empty,
    onSome: ({ threadId, model: open }) =>
      sidePane(h, {
        thread: open,
        group: Option.map(model.group, ({ group }) => group),
        members: model.members,
        self: model.memberId,
        backTo: model.threads.tab === "Tasks" ? "Tasks" : nameOf(model),
        onClose: Message.ClickedAllThreads(),
        follow: h.block(
          ThreadBinding.embedView({ key: threadId, slotId: "thread-follow", model: open, view: followView })
        ),
        body: h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread", model: open, viewInputs: { now } })),
        reply: h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread-reply", model: open, view: replyView }))
      })
  })
)
