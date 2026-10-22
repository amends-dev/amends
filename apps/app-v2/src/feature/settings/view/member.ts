/** A member’s role, access, and membership details. */

import { button, buttonRow, choiceSelect, hint, submit } from "@amends-dev/design/control"
import { entry, entryList, person } from "@amends-dev/design/details"
import { pane, paneBack, paneClose, paneColumn, paneEmpty, paneForm, paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { isAgent } from "../../../data/members.ts"
import { memberMark } from "../../../seen.ts"
import { SettingsBlock } from "../block.ts"
import type { SettingsViewBuilder } from "../composition.ts"
import {
  accessOf,
  findMember,
  isChangingRole,
  isRoleChanged,
  type MemberItem,
  Message,
  type Model,
  mayChangeRole,
  mayReadAccess,
  mayRemove,
  roleDraftOf,
  type Selected,
  workspaceName
} from "../definition.ts"
import { accessDetail, accessName, displayName, statusLabels } from "../wording.ts"
import { failureView } from "./feedback.ts"
import { roleChoices } from "./roles.ts"

/** The form that changes the role of the member open, where the person may. */
const roleForm = (model: Model, selected: Selected, h: SettingsViewBuilder): Html =>
  paneForm(h, { title: "Workspace role", onSubmit: Message.SubmittedRole() }, [
    choiceSelect(
      h,
      {
        id: "member-role",
        label: "Workspace role",
        choices: roleChoices(model),
        value: roleDraftOf(model, selected),
        hint: "Changing the workspace role keeps any separate permissions in place.",
        isDisabled: selected.isSaving,
        onChange: (roleId) => Message.ChoseRole({ roleId })
      },
      { isLabelHidden: true }
    ),
    failureView(selected.failure, h),
    buttonRow(h, [submit(h, "Save role", { isDisabled: !isRoleChanged(model, selected) || selected.isSaving })])
  ])

/** What the member has been assigned, a role or a permission, each with where it reaches and whether it still does. */
const accessSection = (model: Model, selected: Selected, h: SettingsViewBuilder): Html => {
  const access = accessOf(model, selected.memberId)

  return paneSection(h, {
    title: "Access",
    hasStitch: true,
    children: [
      access.length === 0
        ? hint(h, "No access is assigned.")
        : entryList(h, {
            label: "Access",
            children: access.map(({ assignment }) =>
              entry(h, {
                key: assignment.id,
                title: accessName(model, assignment),
                children: [hint(h, accessDetail(assignment))]
              })
            )
          })
    ]
  })
}

/**
 * The side pane of the member open: who they are, their role, their access, and what has become of their membership.
 */
const memberPane = (model: Model, selected: Selected, item: MemberItem, h: SettingsViewBuilder): Html => {
  const { member } = item
  const detail = [
    isAgent(member) ? "Agent" : "Person",
    statusLabels[member.status],
    ...(item.pending || isChangingRole(model, member.id) ? ["Sending…"] : [])
  ].join(" · ")

  return pane(h, {
    variant: "side",
    label: "Member details",
    header: {
      title: "Member details",
      leading: paneBack(h, Message.ClickedCloseMember(), "Back to Members"),
      actions: [paneClose(h, Message.ClickedCloseMember())],
      subtitle: workspaceName(model)
    },
    body: [
      paneColumn(h, [
        person(h, { mark: memberMark(item.member), name: displayName(member, model.memberId), detail }),
        member.status === "active" && mayChangeRole(model, member.id) ? roleForm(model, selected, h) : h.empty,
        mayReadAccess(model, member.id) ? accessSection(model, selected, h) : h.empty,
        paneSection(h, {
          title: "Membership",
          hasStitch: true,
          children:
            member.status === "removed"
              ? [hint(h, "This membership has ended. Invite them again to rejoin.")]
              : [
                  ...(mayRemove(model, member.id)
                    ? [
                        buttonRow(h, [
                          button(h, "Remove member", Message.ClickedRemoveMember({ memberId: member.id }), {
                            isDisabled: selected.isSaving || item.pending
                          })
                        ])
                      ]
                    : []),
                  hint(h, "Rejoining after removal requires a new invitation.")
                ]
        })
      ])
    ]
  })
}

/**
 * What the side pane says when the member open is not in the workspace's records: they may have been removed from
 * what the person can see.
 */
const missingMember = (h: SettingsViewBuilder, model: Model): Html =>
  pane(h, {
    variant: "side",
    label: "Member details",
    header: {
      title: "Member details",
      leading: paneBack(h, Message.ClickedCloseMember(), "Back to Members"),
      actions: [paneClose(h, Message.ClickedCloseMember())],
      subtitle: workspaceName(model)
    },
    body: [
      paneEmpty(h, {
        art: "lost-thread",
        title: "This member isn’t here",
        copy: "They may have been removed, or you can no longer see them."
      })
    ]
  })

/** The side pane of the member open in the settings: who they are, their role, their access, and their membership. */
export const memberView = SettingsBlock.makeView((model, h) =>
  Option.match(model.selected, {
    onNone: () => h.empty,
    onSome: (selected) =>
      Option.match(findMember(model, selected.memberId), {
        onNone: () => missingMember(h, model),
        onSome: (item) => memberPane(model, selected, item, h)
      })
  })
)
