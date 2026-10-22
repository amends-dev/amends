/** Add an agent or confirm ending its membership. */

import { choiceSelect, field, notice, submit } from "@amends-dev/design/control"
import { modal } from "@amends-dev/design/modal"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { AgentsBlock } from "../block.ts"
import { type AgentsViewBuilder, DialogBinding } from "../composition.ts"
import {
  type Adding,
  failureMessage,
  isAddingReady,
  Message,
  type Model,
  problemsOf,
  type Removing,
  SetupTarget,
  startingRoles
} from "../definition.ts"
import { setupFields } from "./setupFields.ts"

/** The name of the workspace, which the dialog that adds an agent says it adds the agent to. */
export type DialogInputs = Readonly<{ workspaceName: string }>

/**
 * The dialog that adds an agent: its name, the role it starts with, which a person who may not give shows as
 * unavailable, and how it is set up, with Create agent disabled until a name, a role, and a model are chosen. What
 * could not be made shows under the fields.
 */
const addingModal = (
  render: RenderInfo,
  adding: Adding,
  model: Model,
  workspaceName: string,
  h: AgentsViewBuilder
): Html => {
  const isSending = Option.isSome(adding.creating)

  return modal(h, render, {
    title: "Add agent",
    context: workspaceName,
    size: "form",
    body: [
      field(
        h,
        {
          id: "add-agent-name",
          label: "Agent name",
          type: "text",
          value: adding.name,
          hint: "How the workspace calls and mentions it.",
          isAutofocus: false,
          isDisabled: isSending,
          attributes: render.initialFocus,
          onInput: (name) => Message.TypedAddingName({ name })
        },
        Option.none()
      ),
      choiceSelect(h, {
        id: "add-agent-role",
        label: "Role",
        choices: startingRoles(model).map(({ role, isGivable }) =>
          isGivable
            ? ([role.id, role.name] as const)
            : ([role.id, role.name, { description: "Only the owner can give this role", isDisabled: true }] as const)
        ),
        value: adding.roleId,
        hint: "What it may do in the workspace, as a member with this role.",
        isDisabled: isSending,
        onChange: (roleId) => Message.ChoseRole({ roleId })
      }),
      ...setupFields(h, model, {
        idPrefix: "add-agent",
        target: SetupTarget.Adding(),
        setup: adding.setup,
        problems: problemsOf(adding.failure),
        isDisabled: isSending
      }),
      notice(h, Option.map(adding.failure, failureMessage))
    ],
    cancelLabel: "Cancel",
    isCancelLeading: true,
    footer: [submit(h, isSending ? "Creating…" : "Create agent", { isDisabled: !isAddingReady(adding) || isSending })],
    onSubmit: Message.SubmittedAdding()
  })
}

/**
 * The dialog that confirms removing an agent, named in its context, saying it leaves the workspace and its messages
 * stay, with why the last try failed.
 */
const removingModal = (render: RenderInfo, removing: Removing, h: AgentsViewBuilder): Html =>
  modal(h, render, {
    title: "Remove agent?",
    size: "compact",
    context: removing.name,
    description: `${removing.name} will leave the workspace. Its messages stay in their threads.`,
    body: [notice(h, Option.map(removing.failure, failureMessage))],
    cancelLabel: "Cancel",
    isCancelLeading: true,
    footer: [submit(h, removing.isSending ? "Removing…" : "Remove agent", { isDisabled: removing.isSending })],
    onSubmit: Message.ConfirmedRemoval()
  })

/**
 * What the dialog shows: the form that adds an agent, or the confirmation that removes one; an empty frame while it has
 * neither.
 */
const dialogModal = (render: RenderInfo, model: Model, workspaceName: string, h: AgentsViewBuilder): Html =>
  Option.match(model.adding, {
    onSome: (adding) => addingModal(render, adding, model, workspaceName, h),
    onNone: () =>
      Option.match(model.removing, {
        onSome: (removing) => removingModal(render, removing, h),
        onNone: () => modal(h, render, { title: "", body: [] })
      })
  })

/**
 * The dialog for adding an agent or confirming its removal, which the page lends the shell: it renders its `dialog`
 * element, with nothing in it while it is closed, wherever the page puts the buttons that open it, the sidebar's, the
 * list's, and the agent's, whether or not the sidebar is on the page.
 */
export const dialogView = AgentsBlock.makeView.withInputs<DialogInputs>((model, { workspaceName }, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: {
        hasDescription: Option.isNone(model.adding) && Option.isSome(model.removing),
        toView: (render) => dialogModal(render, model, workspaceName, h)
      }
    })
  )
)
