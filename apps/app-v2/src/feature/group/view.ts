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
import { markCluster } from "@amends-dev/design/mark"
import { type ModalConfig, modal } from "@amends-dev/design/modal"
import { pane, paneBack, paneClose, paneColumn, paneTabs } from "@amends-dev/design/pane"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { groupTarget, may } from "../../permissions.ts"
import { groupName, initials, isJoinable, memberName, pluralize, threadSubtitle } from "../../seen.ts"
import { titleOf } from "../thread/definition.ts"
import { replyView } from "../thread/view.ts"
import { composerView, tabsView, toolbarView } from "../threads/view.ts"
import { DialogBinding, GroupComposition, type GroupViewBuilder, ThreadBinding, ThreadsBinding } from "./composition.ts"
import { admitted, belongs, mayRename, Message, type Model, membersOf, teamName } from "./definition.ts"

/** The time now, which the days the threads and their messages were published on are read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

/** Whether `memberId` has the workspace open now. */
const isPresent = (model: Model, memberId: MemberId.MemberId): boolean =>
  model.present.some((present) => present.memberId === memberId)

/** The group's name: a team's own, or a conversation's other members, once the group is read. */
const nameOf = (model: Model): string =>
  Option.match(model.group, {
    onNone: () => "A group",
    onSome: ({ group }) => groupName(group, model.members, model.memberId)
  })

/** What marks the group in its title: a team's drawing, or the first letter of a conversation's other member. */
const markOf = (model: Model) =>
  Option.match(model.group, {
    onNone: () => ({ icon: "mark-channel" as const }),
    onSome: ({ group }) =>
      group.kind === "Team" ? { icon: "mark-channel" as const } : { mark: { text: nameOf(model).slice(0, 1) } }
  })

/** Follow, as a bell that is not pressed: following the group is one press away. */
const followButton = (h: GroupViewBuilder): Html =>
  iconButton(h, { icon: "bell", label: "Follow", onClick: Message.ClickedFollow() }, { isPressed: false })

/** Unfollow, as a bell that is filled and pressed: the person follows the group. */
const unfollowButton = (h: GroupViewBuilder): Html =>
  iconButton(h, { icon: "bell-filled", label: "Unfollow", onClick: Message.ClickedUnfollow() }, { isPressed: true })

/** The person's follow of the group as a bell, filled while they follow it, or that a change to it is on its way. */
const followAction = (model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.follow, {
    onNone: () => followButton(h),
    onSome: ({ follow, pending }) =>
      pending ? sending(h, true) : follow.status === "active" ? unfollowButton(h) : followButton(h)
  })

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

/** The members of the group as a cluster of their marks that opens them, once the group is read and has any. */
const membersActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> => {
  const memberIds = membersOf(model)

  return memberIds.length === 0
    ? []
    : [
        markCluster(h, {
          marks: memberIds.map((memberId) => initials(memberName(model.members, memberId))),
          label: pluralize(memberIds.length, "member", "members"),
          onClick: Message.ClickedMembers()
        })
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
        cancelLabel: "Cancel",
        ...panel
      })
    }
  })

/**
 * The group's main pane: its name, titled by its mark, with its members, the person's part in it, and the button
 * to open its settings, under the tabs of its threads and its tasks, and the tab shown, with the composer to start
 * one in the footer, or the line that says to join the team to read them; and the settings' modal.
 */
export const view = GroupComposition.makeView.withInputs<ViewInputs>((model, { now }, h) => {
  const name = nameOf(model)
  // Until the group is read, its threads list as they would for a member.
  const isReadable = Option.isNone(model.group) || belongs(model)
  const threadsInputs = {
    members: model.members,
    groupName: name,
    isTeam: Option.isSome(teamName(model)),
    openThreadId: Option.map(model.thread, ({ threadId }) => threadId),
    now
  }

  return pane(h, {
    variant: "main",
    label: name,
    header: {
      title: name,
      ...markOf(model),
      actions: [...membersActions(model, h), ...partActions(model, h), ...settingsActions(model, h)],
      ...(isReadable
        ? { tabs: h.block(ThreadsBinding.embedView({ slotId: "tabs", model: model.threads, view: tabsView })) }
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
      paneColumn(
        h,
        [
          notice(h, model.notice),
          isReadable
            ? h.block(ThreadsBinding.embedView({ slotId: "threads", model: model.threads, viewInputs: threadsInputs }))
            : hint(h, "Join this team to read its threads.")
        ],
        { isWide: true }
      ),
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
 * The thread open in the group as the side pane, with the button that closes it, Close beside the title and
 * Back before it on a phone, and nothing while none is open.
 */
export const threadView = GroupComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  Option.match(model.thread, {
    onNone: () => h.empty,
    onSome: ({ threadId, model: open }) =>
      pane(h, {
        variant: "side",
        label: "Thread",
        header: {
          title: titleOf(open),
          icon: "mark-reply",
          subtitle: threadSubtitle(
            Option.map(model.group, ({ group }) => group),
            model.members,
            model.memberId
          ),
          leading: paneBack(h, Message.ClickedAllThreads()),
          actions: [paneClose(h, Message.ClickedAllThreads())]
        },
        body: [h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread", model: open, viewInputs: { now } }))],
        footer: [
          h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread-reply", model: open, view: replyView }))
        ]
      })
  })
)
