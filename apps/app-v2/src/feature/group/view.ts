import { Group } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import { button, field, hint, iconButton, notice, submit } from "@amends-dev/design/control"
import { settingRow } from "@amends-dev/design/form"
import { type MarkContent, markStack } from "@amends-dev/design/mark"
import { type GroupMember, memberCount, memberList, memberPicker, memberPickerList } from "@amends-dev/design/members"
import { type ModalConfig, modal } from "@amends-dev/design/modal"
import { pane, paneColumn, paneEmpty, paneTabs } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import { inputId } from "@foldkit/ui/combobox"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { pickerPeople, pickerPeopleChosen } from "../../memberPicker.ts"
import {
  groupName,
  initials,
  isAgent,
  isJoinable,
  memberMark,
  memberName,
  pluralize,
  visibilityHint
} from "../../seen.ts"
import { followView, replyView, sidePane } from "../thread/view.ts"
import { selfName } from "../threads/definition.ts"
import {
  cantLoadConversation,
  composerView,
  tabsView,
  toolbarView,
  type ViewInputs as ThreadsViewInputs
} from "../threads/view.ts"
import {
  DialogBinding,
  GroupComposition,
  type GroupViewBuilder,
  MembersBinding,
  ThreadBinding,
  ThreadsBinding
} from "./composition.ts"
import {
  admissibleMembers,
  admitMembersId,
  admitted,
  type Availability,
  availabilityOf,
  belongs,
  isMembershipChanging,
  mayManageMembers,
  mayRename,
  Message,
  type Model,
  membersOf,
  teamName
} from "./definition.ts"

/**
 * The time now, which the days the threads and their messages were published on are read from, the workspace's name,
 * which a phone shows under the group's title, and the window's width, which decides whether the settings add members
 * in a field or, on a phone, in a view of their own.
 */
export type ViewInputs = Readonly<{ now: DateTime.Utc; workspaceName: string; viewport: Viewport }>

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

/** What a section of the settings gives the modal: its body, and the footer's controls and submit that go with it. */
type SettingsPanel = Pick<ModalConfig<Message>, "body" | "footer" | "onSubmit">

/**
 * The person's membership of the group in words, with the way to join or leave where there is one, which is unavailable
 * while a change to their membership is on its way.
 */
const membershipSetting = (group: Group.Team, model: Model, h: GroupViewBuilder): Html => {
  if (Group.isGeneral(group)) {
    return settingRow(h, { label: "Membership", copy: "Everyone in the workspace belongs to this group." })
  }

  const isChanging = isMembershipChanging(model)

  return belongs(model)
    ? settingRow(h, {
        label: "Membership",
        copy: "You're a member of this group.",
        action: button(h, "Leave group", Message.ClickedLeave(), { isDisabled: isChanging })
      })
    : settingRow(h, {
        label: "Membership",
        copy: "You're not a member of this group.",
        action: isJoinable(group)
          ? button(h, "Join group", Message.ClickedJoin(), { isDisabled: isChanging })
          : undefined
      })
}

/**
 * The General section: the team's name in a field, which only someone who may rename the team can change, its
 * visibility in words, which no one can change here, and the person's membership, with Save changes in the footer.
 */
const generalPanel = (group: Group.Team, model: Model, render: RenderInfo, h: GroupViewBuilder) => {
  const name = nameOf(model)
  const draft = Option.getOrElse(model.renaming, () => name)
  const isRenamable = mayRename(model)

  return {
    body: [
      field(
        h,
        {
          id: "group-name",
          label: "Group name",
          type: "text",
          value: draft,
          onInput: (name) => Message.TypedName({ name }),
          hint: isRenamable
            ? "Everyone in this group sees this name."
            : "Only people who manage this group can rename it.",
          maxLength: 80,
          isDisabled: !isRenamable,
          isAutofocus: false,
          attributes: isRenamable ? render.initialFocus : []
        },
        Option.none()
      ),
      settingRow(h, { label: "Visibility", copy: `${group.visibility}. ${visibilityHint[group.visibility]}` }),
      membershipSetting(group, model, h)
    ],
    footer: [submit(h, "Save changes", { isDisabled: draft === name })],
    onSubmit: Message.SubmittedRename()
  } satisfies SettingsPanel
}

/** What a row of the list says after the member's name, if anything: that they are the person, an agent, sending, or online. */
const noteOf = (model: Model, memberId: MemberId.MemberId, isPending: boolean): Pick<GroupMember<Message>, "note"> => {
  const member = model.members.find(({ id }) => id === memberId)
  const isSelf = memberId === model.memberId
  const notes = [
    isSelf ? "You" : undefined,
    member !== undefined && isAgent(member) ? "Agent" : undefined,
    isPending ? "Sending…" : undefined,
    !isSelf && isPresent(model, memberId) ? "Online" : undefined
  ].filter((note) => note !== undefined)

  return notes.length === 0 ? {} : { note: notes.join(" · ") }
}

/**
 * The group's members as rows of the list: a team's admitted ones, each with Remove, named for them, where the person
 * manages the members, dimmed while the admission is on its way, and none for the person themself, who leaves
 * instead; and a conversation's own, with none.
 */
const memberRows = (model: Model, isManaged: boolean): ReadonlyArray<GroupMember<Message>> =>
  Option.match(model.group, {
    onNone: () => [],
    onSome: ({ group }) =>
      group.kind === "Team"
        ? admitted(model).map(({ membership, pending }) => {
            const name = memberName(model.members, membership.memberId)

            return {
              key: membership.id,
              name,
              mark: markOfMember(model, membership.memberId),
              ...noteOf(model, membership.memberId, pending),
              ...(isManaged && membership.memberId !== model.memberId
                ? {
                    action: {
                      label: "Remove",
                      name: `Remove ${name}`,
                      isDisabled: pending,
                      onClick: Message.ClickedRemoveMember({ membershipId: membership.id })
                    }
                  }
                : {})
            }
          })
        : group.memberIds.map((memberId) => ({
            key: memberId,
            name: memberName(model.members, memberId),
            mark: markOfMember(model, memberId),
            ...noteOf(model, memberId, false)
          }))
  })

/** The words of the button that admits the members chosen: Add, Add 2. */
const addLabel = (chosen: number): string => (chosen === 0 ? "Add" : `Add ${chosen}`)

/** The words of the wide button of a phone's view that admits the members chosen. */
const addViewLabel = (chosen: number): string =>
  chosen === 0 ? "Add members" : `Add ${pluralize(chosen, "member", "members")}`

/**
 * Where the person chooses whom to add: a picker of the workspace's members who are not in the group, with the button
 * that adds those chosen beside it, or, on a phone, a wide button that opens a view of its own for them.
 */
const addMembers = (model: Model, viewport: Viewport, h: GroupViewBuilder): Html =>
  viewport === "Phone"
    ? button(h, "Add members", Message.ClickedAddMembers(), { icon: "mark-new", wide: true })
    : memberPicker(h, {
        id: admitMembersId,
        label: "Add members",
        chosen: pickerPeopleChosen(model.members, model.admitting),
        candidates: pickerPeople(admissibleMembers(model)),
        query: model.membersCombobox.inputValue,
        isOpen: model.membersCombobox.isOpen,
        action:
          model.admitting.length === 0
            ? button(h, addLabel(0), Message.ClickedAdmit(), { isDisabled: true })
            : button(h, addLabel(model.admitting.length), Message.ClickedAdmit(), { variant: "primary" }),
        onRemove: (memberId) => Message.ClickedRemoveAdmitting({ memberId }),
        embed: (viewInputs) =>
          h.block(MembersBinding.embedView({ slotId: "admit-members", model: model.membersCombobox, viewInputs }))
      })

/**
 * The Members section: where the person adds members, if they manage them, how many the group has, and its members,
 * each with Remove where the person manages them.
 */
const membersPanel = (model: Model, viewport: Viewport, h: GroupViewBuilder): SettingsPanel => {
  const isManaged = mayManageMembers(model)

  return {
    body: [
      ...(isManaged ? [addMembers(model, viewport, h)] : []),
      memberCount(h, membersOf(model).length),
      memberList(h, { label: "Members", members: memberRows(model, isManaged) })
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
 * The view a phone moves the settings to for adding members, with Back to the members in place of Close: the field of
 * those chosen over the list of the workspace's members who can be added, and the wide button that adds them.
 */
const addMembersView = (render: RenderInfo, model: Model, h: GroupViewBuilder): Html =>
  modal(h, render, {
    title: "Add members",
    context: `# ${nameOf(model)}`,
    back: { label: "Back to members", onClick: Message.ClickedBackToMembers() },
    body: [
      memberPickerList(h, {
        id: inputId(admitMembersId),
        label: "Search workspace members",
        chosen: pickerPeopleChosen(model.members, model.admitting),
        candidates: pickerPeople(admissibleMembers(model)),
        query: model.admitQuery,
        onQuery: (query) => Message.TypedAdmitQuery({ query }),
        onPick: (memberId) => Message.PickedAdmitMember({ memberId }),
        onRemove: (memberId) => Message.ClickedRemoveAdmitting({ memberId })
      })
    ],
    footer: [
      model.admitting.length === 0
        ? button(h, addViewLabel(0), Message.ClickedAdmit(), { variant: "primary", wide: true, isDisabled: true })
        : button(h, addViewLabel(model.admitting.length), Message.ClickedAdmit(), { variant: "primary", wide: true })
    ]
  })

/**
 * The modal for the group's settings. A team's has its name beside the title, and its General section and Members
 * section in tabs, and on a phone its Members section moves to a view of its own to add members. A conversation's is
 * its Members alone, titled so, with the other members' names beside it. While the group is not read the dialog has
 * no content to show, so it is an empty frame.
 */
const settingsModal = (render: RenderInfo, model: Model, viewport: Viewport, h: GroupViewBuilder): Html =>
  Option.match(model.group, {
    onNone: () => modal(h, render, { title: "Group settings", closeLabel: "Close settings", body: [] }),
    onSome: ({ group }) => {
      if (group.kind !== "Team") {
        return modal(h, render, {
          title: "Members",
          context: nameOf(model),
          closeLabel: "Close settings",
          width: "wide",
          cancelLabel: "Done",
          ...membersPanel(model, viewport, h)
        })
      }

      if (viewport === "Phone" && model.isAddViewOpen && mayManageMembers(model)) {
        return addMembersView(render, model, h)
      }

      const isMembers = model.settingsTab === "Members"

      return modal(h, render, {
        title: "Group settings",
        context: `# ${nameOf(model)}`,
        closeLabel: "Close settings",
        width: "wide",
        tabs: settingsTabs(model, h),
        cancelLabel: isMembers ? "Done" : "Cancel",
        ...(isMembers ? membersPanel(model, viewport, h) : generalPanel(group, model, render, h))
      })
    }
  })

/**
 * What the group says when the person's replica lacks it, as it does for a group they never had or can no longer read.
 */
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
export const view = GroupComposition.makeView.withInputs<ViewInputs>((model, { now, workspaceName, viewport }, h) => {
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
