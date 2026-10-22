/** The forms and progress states for creating or joining a workspace. */

import { button, field, hint, notice, submit } from "@amends-dev/design/control"
import { modal } from "@amends-dev/design/modal"
import type { RenderInfo } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { SelectOnFocus } from "../command.ts"
import { DialogBinding, type WorkspacesViewBuilder } from "../composition.ts"
import {
  Entering,
  type FormErrors,
  hasWorkspaceName,
  type JoinErrors,
  Message,
  type Model,
  noFormErrors,
  noJoinErrors,
  type PendingInvitation
} from "../definition.ts"

const createTitle = "Create workspace"

const createDescription = "A shared place for your team."

/** The modal for the names of the workspace, while the person fills them in or the request is on its way. */
const createFormModal = (
  render: RenderInfo,
  names: Readonly<{ name: string; memberName: string }>,
  errors: FormErrors,
  isSending: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: createTitle,
    description: createDescription,
    size: "compact",
    body: [
      field(
        h,
        {
          id: "workspace-name",
          label: "Workspace name",
          type: "text",
          value: names.name,
          hint: "You’ll be the owner of this workspace.",
          onInput: (name) => Message.TypedName({ name }),
          isAutofocus: false,
          attributes: render.initialFocus
        },
        errors.name
      ),
      field(
        h,
        {
          id: "member-name",
          label: "Your name",
          type: "text",
          value: names.memberName,
          hint: "What people there will call you. You can change it later.",
          onInput: (memberName) => Message.TypedMemberName({ memberName }),
          isAutofocus: false
        },
        errors.memberName
      ),
      notice(h, errors.form),
      isSending ? hint(h, "Creating your workspace…") : h.empty
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, createTitle, { isDisabled: isSending || !hasWorkspaceName(names.name) })],
    onSubmit: Message.SubmittedCreate()
  })

/**
 * The modal for the workspace once it is created, while the listing is read again to open it, or when that
 * failed.
 */
const openingModal = (
  render: RenderInfo,
  workspaceName: string,
  reloadFailed: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: "Workspace created",
    description: `${workspaceName} is ready.`,
    size: "compact",
    body: reloadFailed
      ? [notice(h, Option.some("Your workspace was created, but we couldn’t refresh the list. Try again to open it."))]
      : [hint(h, "Opening your workspace…")],
    ...(reloadFailed
      ? { cancelLabel: "Close", footer: [button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" })] }
      : {})
  })

/** What the invitation's workspace is called in the title of its dialog, as far as it is known. */
const joinTitle = (invitation: PendingInvitation): string => `Join ${invitation.workspaceName ?? "this workspace"}`

const joinDescription = "What should people there call you? You can change it later."

/** The modal for the name the person goes by in the workspace, while they fill it in or the request is on its way. */
const joinFormModal = (
  render: RenderInfo,
  invitation: PendingInvitation,
  name: string,
  errors: JoinErrors,
  isSending: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: joinTitle(invitation),
    description: joinDescription,
    size: "compact",
    body: [
      field(
        h,
        {
          id: "join-name",
          label: "Your name",
          type: "text",
          value: name,
          onInput: (typed) => Message.TypedJoinName({ name: typed }),
          isAutofocus: false,
          attributes: [...render.initialFocus, h.OnMount(SelectOnFocus())]
        },
        errors.name
      ),
      notice(h, errors.form),
      isSending ? hint(h, "Joining…") : h.empty
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Join", { isDisabled: isSending })],
    onSubmit: Message.SubmittedJoin()
  })

/**
 * The modal once the person is in the workspace, while the listing is read again to tell them so, or when that
 * failed.
 */
const joinedModal = (
  render: RenderInfo,
  invitation: PendingInvitation,
  reloadFailed: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: joinTitle(invitation),
    size: "compact",
    body: reloadFailed
      ? [notice(h, Option.some("Joined, but we couldn’t load your workspaces. Try again."))]
      : [hint(h, "Joining…")],
    ...(reloadFailed
      ? { cancelLabel: "Close", footer: [button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" })] }
      : {})
  })

/**
 * The modal for creating a workspace or joining one. While nothing is being done the dialog has no content to
 * show, so it is an empty frame.
 */
const enteringModal = (render: RenderInfo, model: Model, h: WorkspacesViewBuilder): Html =>
  Option.match(model.entering, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: Entering.match({
      FillingCreate: ({ name, memberName, errors }) => createFormModal(render, { name, memberName }, errors, false, h),
      SendingCreate: ({ name, memberName }) => createFormModal(render, { name, memberName }, noFormErrors, true, h),
      Opening: ({ workspaceName, reloadFailed }) => openingModal(render, workspaceName, reloadFailed, h),
      FillingJoin: ({ invitation, name, errors }) => joinFormModal(render, invitation, name, errors, false, h),
      SendingJoin: ({ invitation, name }) => joinFormModal(render, invitation, name, noJoinErrors, true, h),
      Joined: ({ invitation, reloadFailed }) => joinedModal(render, invitation, reloadFailed, h)
    })
  })

/** Whether the dialog has a line that describes it: the forms and the workspace created do, and a join does not. */
const isDescribed = (model: Model): boolean => !Option.exists(model.entering, Entering.isAnyOf(["Joined"]))

/** The dialog for creating or joining a workspace, mounted beside the listing. */
export const dialogView = (model: Model, h: WorkspacesViewBuilder): Html =>
  h.block(
    DialogBinding.embedView({
      slotId: "enter-workspace",
      model: model.dialog,
      viewInputs: { hasDescription: isDescribed(model), toView: (render) => enteringModal(render, model, h) }
    })
  )
