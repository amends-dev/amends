/** Group settings and membership dialogs. */

import { Group } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import { button, field, submit } from "@amends-dev/design/control"
import { settingRow } from "@amends-dev/design/form"
import { type GroupMember, memberCount, memberList, memberPicker, memberPickerList } from "@amends-dev/design/members"
import { type ModalConfig, modal } from "@amends-dev/design/modal"
import { paneTabs } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import { inputId } from "@foldkit/ui/combobox"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { isJoinable } from "../../../data/groups.ts"
import { isAgent, memberName } from "../../../data/members.ts"
import { pluralize } from "../../../view/counts.ts"
import { visibilityHint } from "../../../view/groups.ts"
import { pickerPeople, pickerPeopleChosen } from "../../../view/memberPicker.ts"
import { type GroupViewBuilder, MembersBinding } from "../composition.ts"
import {
  admissibleMembers,
  admitMembersId,
  admitted,
  belongs,
  isMembershipChanging,
  mayManageMembers,
  mayRename,
  Message,
  type Model,
  membersOf
} from "../definition.ts"
import { nameOf, markOfMember } from "./identity.ts"

/** Whether `memberId` has the workspace open now. */
const isPresent = (model: Model, memberId: MemberId.MemberId): boolean =>
  model.present.some((present) => present.memberId === memberId)

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
        copy: "You’re a member of this group.",
        action: button(h, "Leave group", Message.ClickedLeave(), { isDisabled: isChanging })
      })
    : settingRow(h, {
        label: "Membership",
        copy: "You’re not a member of this group.",
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

/**
 * What a row of the list says after the member's name, if anything: that they are the person, an agent, sending, or
 * online.
 */
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
export const settingsModal = (render: RenderInfo, model: Model, viewport: Viewport, h: GroupViewBuilder): Html =>
  Option.match(model.group, {
    onNone: () => modal(h, render, { title: "Group settings", closeLabel: "Close settings", body: [] }),
    onSome: ({ group }) => {
      if (group.kind !== "Team") {
        return modal(h, render, {
          title: "Members",
          context: nameOf(model),
          closeLabel: "Close settings",
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
        tabs: settingsTabs(model, h),
        cancelLabel: isMembers ? "Done" : "Cancel",
        ...(isMembers ? membersPanel(model, viewport, h) : generalPanel(group, model, render, h))
      })
    }
  })
