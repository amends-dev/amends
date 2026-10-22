/** The dialogs for starting a group or conversation. */

import { announcement, choiceGroup, field, notice, submit } from "@amends-dev/design/control"
import { memberPicker } from "@amends-dev/design/members"
import { modal } from "@amends-dev/design/modal"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { visibilityHint } from "../../../view/groups.ts"
import { includedHint, pickerPeople, pickerPeopleChosen, youInPicker } from "../../../view/memberPicker.ts"
import { GroupsBlock } from "../block.ts"
import { DialogBinding, type GroupsViewBuilder, MembersBinding, VisibilityBinding } from "../composition.ts"
import {
  conversationWith,
  isTeamReady,
  Message,
  type Model,
  others,
  Starting,
  startingMembersId,
  teamVisibilityId
} from "../definition.ts"

/** What the New message modal says when the people chosen are exactly those of a conversation the person has. */
const existingConversationLine = "You already have a conversation with them."

/**
 * The modal for what the person is starting: a team, or a conversation with the people they choose, which is New
 * message as `apps/ui` has it. A conversation they have with exactly those people is opened, not started, and the modal
 * says so. While nothing is being started the dialog has no content to show, so it is an empty frame.
 */
const startingModal = (render: RenderInfo, model: Model, h: GroupsViewBuilder): Html =>
  Option.match(model.starting, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: Starting.match({
      Team: (team) =>
        modal(h, render, {
          title: "Create group",
          description: "Set a name, visibility, and members.",
          body: [
            field(
              h,
              {
                id: "team-name",
                label: "Group name",
                type: "text",
                value: team.name,
                placeholder: "e.g. release-planning",
                maxLength: 80,
                onInput: (name) => Message.TypedTeamName({ name }),
                isAutofocus: false,
                attributes: render.initialFocus
              },
              Option.none()
            ),
            choiceGroup(h, {
              id: teamVisibilityId,
              label: "Visibility",
              choices: [
                ["Public", "Public"],
                ["Private", "Private"]
              ],
              value: team.visibility,
              hint: visibilityHint[team.visibility],
              embed: (viewInputs) =>
                h.block(
                  VisibilityBinding.embedView({ slotId: "team-visibility", model: model.visibilityGroup, viewInputs })
                )
            }),
            memberPicker(h, {
              id: startingMembersId,
              label: "Members",
              locked: [youInPicker(model.members, model.memberId)],
              chosen: pickerPeopleChosen(model.members, team.memberIds),
              candidates: pickerPeople(others(model)),
              query: model.membersCombobox.inputValue,
              isOpen: model.membersCombobox.isOpen,
              hint: includedHint(team.memberIds.length),
              onRemove: (memberId) => Message.ClickedRemoveStartingMember({ memberId }),
              embed: (viewInputs) =>
                h.block(
                  MembersBinding.embedView({ slotId: "starting-members", model: model.membersCombobox, viewInputs })
                )
            }),
            notice(h, team.failure)
          ],
          cancelLabel: "Cancel",
          footer: [submit(h, "Create group", { isDisabled: !isTeamReady(team) })],
          onSubmit: Message.SubmittedTeam()
        }),
      Conversation: ({ memberIds }) => {
        const hasConversation = Option.isSome(conversationWith(model, memberIds))

        return modal(h, render, {
          title: "New message",
          description: "Everyone you choose sees every thread in your conversation together.",
          size: "compact",
          body: [
            memberPicker(h, {
              id: startingMembersId,
              label: "To",
              placeholder: "Add someone…",
              chosen: pickerPeopleChosen(model.members, memberIds),
              candidates: pickerPeople(others(model)),
              query: model.membersCombobox.inputValue,
              isOpen: model.membersCombobox.isOpen,
              attributes: render.initialFocus,
              onRemove: (memberId) => Message.ClickedRemoveStartingMember({ memberId }),
              embed: (viewInputs) =>
                h.block(
                  MembersBinding.embedView({ slotId: "starting-members", model: model.membersCombobox, viewInputs })
                )
            }),
            announcement(h, hasConversation ? Option.some(existingConversationLine) : Option.none())
          ],
          cancelLabel: "Cancel",
          footer: [
            submit(h, hasConversation ? "Open conversation" : "Start conversation", {
              isDisabled: memberIds.length === 0
            })
          ],
          onSubmit: Message.SubmittedConversation()
        })
      }
    })
  })

/**
 * The dialog for what the person is starting, a team or a conversation, which the page lends the shell: it
 * renders its `dialog` element, with nothing in it while it is closed, wherever the page puts the buttons that
 * open it, the sidebar's and the browse page's, whether or not the sidebar is on the page.
 */
export const dialogView = GroupsBlock.makeView((model, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "starting",
      model: model.dialog,
      viewInputs: { hasDescription: Option.isSome(model.starting), toView: (render) => startingModal(render, model, h) }
    })
  )
)
