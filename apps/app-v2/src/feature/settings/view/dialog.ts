/** Invitations, ownership transfer, member removal, and name changes. */

import { button, choiceSelect, field, hint, submit } from "@amends-dev/design/control"
import { historyRow, summary } from "@amends-dev/design/directory"
import { modal } from "@amends-dev/design/modal"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { SettingsBlock } from "../block.ts"
import { SelectOnFocus } from "../command.ts"
import { DialogBinding, type SettingsViewBuilder } from "../composition.ts"
import {
  Entering,
  invitationHistory,
  invitationStatus,
  isNameChanged,
  type InvitationItem,
  Message,
  type Model,
  ownName,
  transferCandidates,
  workspaceName
} from "../definition.ts"
import { invitationDetail, invitationStatusLabels, settingsMessage } from "../wording.ts"
import { failureView } from "./feedback.ts"
import { roleChoices } from "./roles.ts"

type InvitingEntering = Extract<Entering, { readonly _tag: "Inviting" }>

type TransferringEntering = Extract<Entering, { readonly _tag: "Transferring" }>

type RevokingEntering = Extract<Entering, { readonly _tag: "Revoking" }>

type RemovingEntering = Extract<Entering, { readonly _tag: "Removing" }>

type ChangingNameEntering = Extract<Entering, { readonly _tag: "ChangingName" }>

/** The dialog that drafts an invitation: the address it is for and the role it gives, which stay under a failure. */
const invitingModal = (render: RenderInfo, inviting: InvitingEntering, model: Model, h: SettingsViewBuilder): Html => {
  const refusal = Option.filter(inviting.failure, ({ reason }) => reason === "Invalid")

  return modal(h, render, {
    title: "Invite member",
    size: "compact",
    context: workspaceName(model),
    body: [
      field(
        h,
        {
          id: "invite-email",
          label: "Sign-in email",
          type: "email",
          value: inviting.email,
          hint: "Use the exact email they sign in with.",
          isAutofocus: false,
          isDisabled: inviting.isSending,
          attributes: [...render.initialFocus, h.Autocomplete("off"), h.Spellcheck(false)],
          onInput: (email) => Message.TypedInviteEmail({ email })
        },
        Option.map(refusal, settingsMessage)
      ),
      choiceSelect(h, {
        id: "invite-role",
        label: "Workspace role",
        choices: roleChoices(model),
        value: inviting.roleId,
        hint: "Valid for seven days. It appears in their workspace picker when they sign in.",
        isDisabled: inviting.isSending,
        onChange: (roleId) => Message.ChoseInviteRole({ roleId })
      }),
      hint(h, "No email is sent."),
      failureView(
        Option.filter(inviting.failure, ({ reason }) => reason !== "Invalid"),
        h
      )
    ],
    cancelLabel: "Cancel",
    footer: [
      submit(h, inviting.isSending ? "Creating…" : "Create invitation", {
        isDisabled: inviting.isSending || inviting.email.trim() === ""
      })
    ],
    onSubmit: Message.SubmittedInvite()
  })
}

/**
 * An invitation in the history as a row of the history: its address over what it gives and when it ends or was made,
 * where it stands in words, and Revoke while it waits.
 */
const historyItem = (item: InvitationItem, model: Model, now: DateTime.Utc, h: SettingsViewBuilder): Html => {
  const { details } = item.invitation
  const status = invitationStatus(item, now)

  return h.keyed("li")(
    details.id,
    [],
    [
      historyRow(h, {
        title: details.recipientEmail,
        detail: invitationDetail(item, model, now),
        status: invitationStatusLabels[status],
        ...(status === "pending"
          ? {
              action: {
                label: "Revoke",
                name: `Revoke invitation for ${details.recipientEmail}`,
                isDisabled: item.pending,
                onClick: Message.ClickedRevoke({ invitationId: details.id })
              }
            }
          : {})
      })
    ]
  )
}

/** The dialog that lists every invitation there has been, newest first, with the way to make another. */
const historyModal = (render: RenderInfo, model: Model, now: DateTime.Utc, h: SettingsViewBuilder): Html => {
  const history = invitationHistory(model)

  return modal(h, render, {
    title: "Invitations",
    context: workspaceName(model),
    body: [
      summary(h, { copy: "Invitations", count: `${history.length} total` }),
      history.length === 0
        ? hint(h, "No invitations yet.")
        : h.ul(
            [h.AriaLabel("Invitation history")],
            history.map((item) => historyItem(item, model, now, h))
          )
    ],
    leading: [button(h, "Invite people", Message.ClickedInvite())],
    cancelLabel: "Done"
  })
}

/** The dialog that confirms revoking an invitation, which it names. */
const revokingModal = (render: RenderInfo, revoking: RevokingEntering, h: SettingsViewBuilder): Html =>
  modal(h, render, {
    title: "Revoke invitation?",
    size: "compact",
    context: revoking.recipient,
    description: "This person will no longer be able to join using this invitation.",
    body: [failureView(revoking.failure, h)],
    cancelLabel: "Cancel",
    footer: [submit(h, revoking.isSending ? "Revoking…" : "Revoke invitation", { isDisabled: revoking.isSending })],
    onSubmit: Message.ConfirmedRevocation()
  })

/** The dialog that chooses the workspace's new owner among the members who can become it, and says what it means. */
const transferringModal = (
  render: RenderInfo,
  transferring: TransferringEntering,
  model: Model,
  h: SettingsViewBuilder
): Html => {
  const candidates = transferCandidates(model)
  const chosen = Option.flatMapNullishOr(transferring.newOwner, (newOwner) =>
    candidates.find((candidate) => candidate.id === newOwner)
  )
  const newOwnerChoices: ReadonlyArray<readonly [string, string]> = [
    ["", "Choose a member"],
    ...candidates.map(({ id, name }) => [id, name] as const)
  ]

  return modal(h, render, {
    title: "Transfer ownership",
    size: "compact",
    context: workspaceName(model),
    body: [
      choiceSelect(h, {
        id: "new-owner",
        label: "New owner",
        choices: newOwnerChoices,
        value: Option.match(chosen, { onNone: () => "", onSome: ({ id }) => id }),
        hint: `${Option.match(chosen, { onNone: () => "The new owner", onSome: ({ name }) => name })} becomes the only owner. You’ll remain an administrator and lose owner-only actions.`,
        isDisabled: transferring.isSending,
        attributes: render.initialFocus,
        onChange: (value) =>
          Message.ChoseNewOwner({
            memberId: Option.map(
              Option.fromUndefinedOr(candidates.find((candidate) => candidate.id === value)),
              ({ id }) => id
            )
          })
      }),
      failureView(transferring.failure, h)
    ],
    cancelLabel: "Cancel",
    footer: [
      submit(h, transferring.isSending ? "Transferring…" : "Transfer ownership", {
        isDisabled: Option.isNone(chosen) || transferring.isSending
      })
    ],
    onSubmit: Message.ConfirmedTransfer()
  })
}

/** The dialog that confirms removing a member, whom it names as they were called when the person asked. */
const removingModal = (render: RenderInfo, removing: RemovingEntering, model: Model, h: SettingsViewBuilder): Html =>
  modal(h, render, {
    title: `Remove ${removing.name}?`,
    size: "compact",
    description: `They will lose access to ${workspaceName(model)}. To rejoin, they’ll need a fresh invitation. Their previous membership will remain in the removed-member history.`,
    body: [failureView(removing.failure, h)],
    cancelLabel: "Cancel",
    footer: [submit(h, removing.isSending ? "Removing…" : "Remove member", { isDisabled: removing.isSending })],
    onSubmit: Message.ConfirmedRemoval()
  })

/**
 * The compact dialog that changes the person's own name in the workspace it names, which they see as it is now with its
 * text selected: what people there call them, while others keep their own. Saving waits for a name that is not blank
 * and not the one they have, and neither saving nor cancelling can be done while it is on its way.
 */
const changingNameModal = (
  render: RenderInfo,
  changing: ChangingNameEntering,
  model: Model,
  h: SettingsViewBuilder
): Html => {
  const refusal = Option.filter(changing.failure, ({ reason }) => reason === "Invalid")

  return modal(h, render, {
    title: "Your name",
    context: workspaceName(model),
    description: "What people in this workspace call you. Others keep their own.",
    size: "compact",
    body: [
      field(
        h,
        {
          id: "own-name",
          label: "Name",
          type: "text",
          value: changing.name,
          isAutofocus: false,
          isDisabled: changing.isSending,
          attributes: [...render.initialFocus, h.OnMount(SelectOnFocus()), h.Autocomplete("off"), h.Spellcheck(false)],
          onInput: (name) => Message.TypedOwnName({ name })
        },
        Option.map(refusal, settingsMessage)
      ),
      failureView(
        Option.filter(changing.failure, ({ reason }) => reason !== "Invalid"),
        h
      )
    ],
    cancelLabel: "Cancel",
    isCancelDisabled: changing.isSending,
    footer: [
      submit(h, changing.isSending ? "Saving…" : "Save name", {
        isDisabled: changing.isSending || !isNameChanged(changing.name, ownName(model))
      })
    ],
    onSubmit: Message.SubmittedOwnName()
  })
}

/** What the dialog shows: what the person is doing in it, or an empty frame while they are not doing anything. */
const dialogModal = (render: RenderInfo, model: Model, now: DateTime.Utc, h: SettingsViewBuilder): Html =>
  Option.match(model.entering, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: (entering) =>
      Entering.match(entering, {
        Inviting: (inviting) => invitingModal(render, inviting, model, h),
        ViewingHistory: () => historyModal(render, model, now, h),
        Revoking: (revoking) => revokingModal(render, revoking, h),
        Transferring: (transferring) => transferringModal(render, transferring, model, h),
        Removing: (removing) => removingModal(render, removing, model, h),
        ChangingName: (changing) => changingNameModal(render, changing, model, h)
      })
  })

/**
 * Whether the dialog opens with a line that describes it: it does to confirm revoking an invitation or removing a
 * member, and to change the person's own name.
 */
const hasDescription = (model: Model): boolean =>
  Option.exists(model.entering, Entering.isAnyOf(["Revoking", "Removing", "ChangingName"]))

/** What the dialog is given besides the model: the time now, which the invitations' ends are told against. */
export type DialogInputs = Readonly<{ now: DateTime.Utc }>

/**
 * The dialog for inviting someone, reading every invitation, revoking one, handing the workspace over, removing a
 * member, or changing the person's own name, which the page lends the shell: it renders its `dialog` element, with
 * nothing in it while it is closed, wherever the buttons that open it are, on the Members page, the Workspace page, the
 * member in the side pane, or the account menu on the rail.
 */
export const dialogView = SettingsBlock.makeView.withInputs<DialogInputs>((model, { now }, h) =>
  h.block(
    DialogBinding.embedView({
      slotId: "dialog",
      model: model.dialog,
      viewInputs: {
        hasDescription: hasDescription(model),
        toView: (render) => dialogModal(render, model, now, h)
      }
    })
  )
)
