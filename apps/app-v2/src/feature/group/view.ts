import { Group, GroupMembershipPermissions, GroupPermissions } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, errorView, field, memberSelect, sending, submit } from "../../controls.ts"
import { groupTarget, may } from "../../permissions.ts"
import { groupName, isJoinable, memberName } from "../../seen.ts"
import { GroupComposition, type GroupViewBuilder, ThreadBinding, ThreadsBinding } from "./composition.ts"
import { admitted, belongs, Message, type Model, teamName } from "./definition.ts"

/** Whether `memberId` has the workspace open now. */
const isPresent = (model: Model, memberId: MemberId.MemberId): boolean =>
  model.present.some((present) => present.memberId === memberId)

/** The group's name, with renaming for a team the person belongs to and may rename, and the form while they do. */
const nameView = (model: Model, h: GroupViewBuilder): Html => {
  const name = Option.match(model.group, {
    onNone: () => "A group",
    onSome: ({ group }) => groupName(group, model.members, model.memberId)
  })
  const mayRename =
    Option.isSome(teamName(model)) &&
    belongs(model) &&
    may(model.grants, GroupPermissions.Rename, groupTarget(model.workspaceId, model.groupId))
  return Option.match(model.renaming, {
    onNone: () => h.div([], [h.h3([], [name]), mayRename ? button(h, "Rename", Message.ClickedRename()) : h.empty]),
    onSome: (draft) =>
      h.form(
        [h.OnSubmit(Message.SubmittedRename())],
        [
          field(
            h,
            {
              id: "group-name",
              label: "Name",
              type: "text",
              value: draft,
              onInput: (name) => Message.TypedName({ name })
            },
            Option.none()
          ),
          submit(h, "Save"),
          button(h, "Cancel", Message.ClickedCancelRename())
        ]
      )
  })
}

/** The person's follow of the group: following it or not, and whether a change to that is on its way. */
const followView = (model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.follow, {
    onNone: () => button(h, "Follow", Message.ClickedFollow()),
    onSome: ({ follow, pending }) =>
      pending
        ? h.span([], ["Updating…"])
        : follow.status === "active"
          ? button(h, "Unfollow", Message.ClickedUnfollow())
          : button(h, "Follow", Message.ClickedFollow())
  })

/**
 * The person's part in the group: following it and leaving a team, except general, while they
 * belong to it; joining a public team while they do not.
 */
const partView = (model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.group, {
    onNone: () => h.empty,
    onSome: ({ group }) =>
      belongs(model)
        ? h.div(
            [],
            [
              followView(model, h),
              group.kind === "Team" && !Group.isGeneral(group) ? button(h, "Leave", Message.ClickedLeave()) : h.empty
            ]
          )
        : isJoinable(group)
          ? button(h, "Join", Message.ClickedJoin())
          : h.empty
  })

/**
 * A team's members, and for a member of it who may manage them, removing them and admitting
 * another member, except to general, which every member belongs to.
 */
const membersView = (model: Model, h: GroupViewBuilder): Html => {
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
  return h.section(
    [h.AriaLabel("Members")],
    [
      h.h4([], ["Members"]),
      h.ul(
        [],
        admissions.map(({ membership, pending }) =>
          h.keyed("li")(
            membership.id,
            [],
            [
              memberName(model.members, membership.memberId),
              isPresent(model, membership.memberId) ? " · online" : "",
              sending(pending, h),
              !isManaged || pending || membership.memberId === model.memberId
                ? h.empty
                : button(h, "Remove", Message.ClickedRemoveMember({ membershipId: membership.id }))
            ]
          )
        )
      ),
      !isManaged || admissible.length === 0
        ? h.empty
        : h.form(
            [h.OnSubmit(Message.SubmittedAdmit())],
            [
              memberSelect(h, {
                id: "admit-member",
                label: "Add a member",
                none: "Choose a member",
                members: admissible,
                value: model.admitting,
                onChange: (memberId) => Message.ChoseMemberToAdmit({ memberId })
              }),
              submit(h, "Add")
            ]
          )
    ]
  )
}

/** The group's name and the person's part in it, then the thread open in it, or its members and threads. */
export const view = GroupComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel("Group")],
    [
      errorView(model.notice, h),
      h.header([], [nameView(model, h), partView(model, h)]),
      Option.match(model.thread, {
        onSome: ({ threadId, model: open }) =>
          h.div(
            [],
            [
              button(h, "All threads", Message.ClickedAllThreads()),
              h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread", model: open }))
            ]
          ),
        onNone: () =>
          h.div(
            [],
            [
              Option.isSome(teamName(model)) ? membersView(model, h) : h.empty,
              // Until the group is read, its threads list as they would for a member.
              Option.isNone(model.group) || belongs(model)
                ? h.block(ThreadsBinding.embedView({ slotId: "threads", model: model.threads }))
                : h.p([], ["Join this team to read its threads."])
            ]
          )
      })
    ]
  )
)
