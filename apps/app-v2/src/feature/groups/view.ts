import { GroupPermissions } from "@amends-dev/core/group"
import { field, iconButton, notice, submit, textarea, toggle } from "@amends-dev/design/control"
import { modal } from "@amends-dev/design/modal"
import { sidebarEmpty, sidebarItem, sidebarSection, sidebarSections } from "@amends-dev/design/sidebar"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberChoice } from "../../memberChoice.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { groupName, isJoinable } from "../../seen.ts"
import { DialogBinding, GroupsComposition, type GroupsViewBuilder } from "./composition.ts"
import { belongsTo, type GroupItem, Message, type Model, others, Starting } from "./definition.ts"

/** The title of the thread open in the group open, which the page reads from the group, when one is. */
export type ViewInputs = Readonly<{ openThread: Option.Option<string> }>

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
    ...(group.kind === "Team" ? { icon: "mark-channel" as const } : { mark: name.slice(0, 1) }),
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
              attributes: render.initialFocus
            }),
            textarea(h, {
              id: "conversation-text",
              label: "First message",
              value: text,
              onInput: (text) => Message.TypedConversationText({ text })
            })
          ],
          cancelLabel: "Cancel",
          footer: [submit(h, "Start")],
          onSubmit: Message.SubmittedConversation()
        })
    })
  })

/**
 * The sidebar's sections of the groups: the teams the person belongs to, their conversations, and the public
 * teams they may join, with the modal for starting a team or a conversation after them.
 */
export const view = GroupsComposition.makeView.withInputs<ViewInputs>((model, { openThread }, h) => {
  const own = model.groups.filter(({ group }) => belongsTo(model, group))
  const teams = own.filter(({ group }) => group.kind === "Team")
  const conversations = own.filter(({ group }) => group.kind !== "Team")
  const joinable = model.groups.filter(({ group }) => isJoinable(group) && !belongsTo(model, group))

  return sidebarSections(h, [
    notice(h, model.notice),
    sidebarSection(h, {
      label: "Groups",
      actions: may(model.grants, GroupPermissions.Create, workspaceTarget(model.workspaceId))
        ? [
            iconButton(
              h,
              { icon: "mark-new", label: "New team", onClick: Message.ClickedNewTeam() },
              { size: "compact" }
            )
          ]
        : [],
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
        }),
    h.block(
      DialogBinding.embedView({
        slotId: "starting",
        model: model.dialog,
        viewInputs: { toView: (render) => startingModal(render, model, h) }
      })
    )
  ])
})
