import { GroupPermissions } from "@amends-dev/core/group"
import * as Button from "@foldkit/ui/button"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, errorView, field, memberSelect, sending, submit, textarea, toggle } from "../../controls.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { groupName, isJoinable } from "../../seen.ts"
import { GroupsComposition, type GroupsViewBuilder } from "./composition.ts"
import { belongsTo, type GroupItem, Message, type Model, others, Starting } from "./definition.ts"

/** The groups `items`, by name, the picked one marked, under `title`. */
const listView = (title: string, items: ReadonlyArray<GroupItem>, model: Model, h: GroupsViewBuilder): Html =>
  items.length === 0
    ? h.empty
    : h.div(
        [],
        [
          h.h3([], [title]),
          h.ul(
            [h.AriaLabel(title)],
            items.map(({ group, pending }) =>
              h.keyed("li")(
                group.id,
                [],
                [
                  Button.view(
                    {
                      onClick: Message.ClickedGroup({ groupId: group.id }),
                      toView: (attributes) =>
                        h.button(
                          [
                            ...attributes.button,
                            ...(Option.contains(model.selected, group.id) ? [h.AriaCurrent("page")] : [])
                          ],
                          [groupName(group, model.members, model.memberId)]
                        )
                    },
                    h
                  ),
                  sending(pending, h)
                ]
              )
            )
          )
        ]
      )

/** The form for what the person is starting: a team, or a conversation with another member. */
const startingView = (starting: Starting, model: Model, h: GroupsViewBuilder): Html =>
  Starting.match(starting, {
    Team: ({ name, isPublic }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedTeam()), h.AriaLabel("New team")],
        [
          field(
            h,
            {
              id: "team-name",
              label: "Team name",
              type: "text",
              value: name,
              onInput: (name) => Message.TypedTeamName({ name })
            },
            Option.none()
          ),
          toggle(h, {
            id: "team-public",
            label: "Anyone in the workspace can join",
            isOn: isPublic,
            onToggle: (isPublic) => Message.ToggledTeamPublic({ isPublic })
          }),
          submit(h, "Create team"),
          button(h, "Cancel", Message.ClickedCancelStarting())
        ]
      ),
    Conversation: ({ memberId, text }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedConversation()), h.AriaLabel("New conversation")],
        [
          memberSelect(h, {
            id: "conversation-member",
            label: "With",
            none: "Choose a member",
            members: others(model),
            value: memberId,
            onChange: (memberId) => Message.ChoseConversationMember({ memberId })
          }),
          textarea(h, {
            id: "conversation-text",
            label: "First message",
            value: text,
            onInput: (text) => Message.TypedConversationText({ text })
          }),
          submit(h, "Start"),
          button(h, "Cancel", Message.ClickedCancelStarting())
        ]
      )
  })

/** The groups the person belongs to, the teams they may join, and starting a team or a conversation. */
export const view = GroupsComposition.makeView((model, h) =>
  h.nav(
    [h.AriaLabel("Groups")],
    [
      errorView(model.notice, h),
      listView(
        "Your groups",
        model.groups.filter(({ group }) => belongsTo(model, group)),
        model,
        h
      ),
      listView(
        "Other teams",
        model.groups.filter(({ group }) => isJoinable(group) && !belongsTo(model, group)),
        model,
        h
      ),
      Option.match(model.starting, {
        onSome: (starting) => startingView(starting, model, h),
        onNone: () =>
          h.div(
            [],
            [
              may(model.grants, GroupPermissions.Create, workspaceTarget(model.workspaceId))
                ? button(h, "New team", Message.ClickedNewTeam())
                : h.empty,
              others(model).length === 0 ? h.empty : button(h, "New conversation", Message.ClickedNewConversation())
            ]
          )
      })
    ]
  )
)
