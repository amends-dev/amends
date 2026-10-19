import { Group, GroupMembershipPermissions, GroupPermissions } from "@amends-dev/core/group"
import type { MemberId } from "@amends-dev/core/workspace"
import { button, field, notice, sending, submit } from "@amends-dev/design/control"
import { form } from "@amends-dev/design/form"
import { pane, paneClose } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { groupTarget, may } from "../../permissions.ts"
import { groupName, isJoinable, memberName } from "../../seen.ts"
import { titleOf } from "../thread/definition.ts"
import { replyView } from "../thread/view.ts"
import { composerView } from "../threads/view.ts"
import { GroupComposition, type GroupViewBuilder, ThreadBinding, ThreadsBinding } from "./composition.ts"
import { admitted, belongs, Message, type Model, teamName } from "./definition.ts"

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
      group.kind === "Team" ? { icon: "mark-channel" as const } : { mark: nameOf(model).slice(0, 1) }
  })

/** Renaming, for a team the person belongs to and may rename, until they start. */
const renameActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> =>
  Option.isSome(teamName(model)) &&
  belongs(model) &&
  Option.isNone(model.renaming) &&
  may(model.grants, GroupPermissions.Rename, groupTarget(model.workspaceId, model.groupId))
    ? [button(h, "Rename", Message.ClickedRename())]
    : []

/** The form to change the team's name, while the person renames it. */
const renamingView = (model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.renaming, {
    onNone: () => h.empty,
    onSome: (draft) =>
      form(h, { onSubmit: Message.SubmittedRename() }, [
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
        button(h, "Cancel", Message.ClickedCancelRename(), { variant: "quiet" })
      ])
  })

/** The person's follow of the group: following it or not, and whether a change to that is on its way. */
const followAction = (model: Model, h: GroupViewBuilder): Html =>
  Option.match(model.follow, {
    onNone: () => button(h, "Follow", Message.ClickedFollow(), { variant: "quiet" }),
    onSome: ({ follow, pending }) =>
      pending
        ? sending(h, true)
        : follow.status === "active"
          ? button(h, "Unfollow", Message.ClickedUnfollow(), { variant: "quiet" })
          : button(h, "Follow", Message.ClickedFollow(), { variant: "quiet" })
  })

/**
 * The person's part in the group: following it and leaving a team, except general, while they
 * belong to it; joining a public team while they do not.
 */
const partActions = (model: Model, h: GroupViewBuilder): ReadonlyArray<Html> =>
  Option.match(model.group, {
    onNone: () => [],
    onSome: ({ group }) =>
      belongs(model)
        ? [
            followAction(model, h),
            ...(group.kind === "Team" && !Group.isGeneral(group) ? [button(h, "Leave", Message.ClickedLeave())] : [])
          ]
        : isJoinable(group)
          ? [button(h, "Join", Message.ClickedJoin(), { variant: "primary" })]
          : []
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
      h.h2([], ["Members"]),
      h.ul(
        [],
        admissions.map(({ membership, pending }) =>
          h.keyed("li")(
            membership.id,
            [],
            [
              memberName(model.members, membership.memberId),
              isPresent(model, membership.memberId) ? " · online" : "",
              sending(h, pending),
              !isManaged || pending || membership.memberId === model.memberId
                ? h.empty
                : button(h, "Remove", Message.ClickedRemoveMember({ membershipId: membership.id }), {
                    variant: "quiet"
                  })
            ]
          )
        )
      ),
      !isManaged || admissible.length === 0
        ? h.empty
        : form(h, { onSubmit: Message.SubmittedAdmit() }, [
            memberChoice(h, {
              id: "admit-member",
              label: "Add a member",
              none: "Choose a member",
              members: admissible,
              value: model.admitting,
              onChange: (memberId) => Message.ChoseMemberToAdmit({ memberId })
            }),
            submit(h, "Add")
          ])
    ]
  )
}

/**
 * The group's main pane: its name, titled by its mark, with the person's part in it, then, for a team, its
 * members, and its threads, with the composer to start one in the footer, or the line that says to join the
 * team to read them.
 */
export const view = GroupComposition.makeView((model, h) => {
  const name = nameOf(model)
  // Until the group is read, its threads list as they would for a member.
  const isReadable = Option.isNone(model.group) || belongs(model)
  const threadsInputs = {
    members: model.members,
    groupName: name,
    openThreadId: Option.map(model.thread, ({ threadId }) => threadId)
  }

  return pane(h, {
    variant: "main",
    label: name,
    header: { title: name, ...markOf(model), actions: [...partActions(model, h), ...renameActions(model, h)] },
    body: [
      notice(h, model.notice),
      renamingView(model, h),
      Option.isSome(teamName(model)) ? membersView(model, h) : h.empty,
      isReadable
        ? h.block(ThreadsBinding.embedView({ slotId: "threads", model: model.threads, viewInputs: threadsInputs }))
        : h.p([], ["Join this team to read its threads."])
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

/** The thread open in the group as the side pane, with the button that closes it, and nothing while none is open. */
export const threadView = GroupComposition.makeView((model, h) =>
  Option.match(model.thread, {
    onNone: () => h.empty,
    onSome: ({ threadId, model: open }) =>
      pane(h, {
        variant: "side",
        label: "Thread",
        header: {
          title: titleOf(open),
          icon: "mark-reply",
          subtitle: `Thread in ${nameOf(model)}`,
          actions: [paneClose(h, Message.ClickedAllThreads())]
        },
        body: [h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread", model: open }))],
        footer: [
          h.block(ThreadBinding.embedView({ key: threadId, slotId: "thread-reply", model: open, view: replyView }))
        ]
      })
  })
)
