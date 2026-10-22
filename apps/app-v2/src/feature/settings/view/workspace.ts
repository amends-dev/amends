/** Workspace name, identity, and ownership settings. */

import { button, buttonRow, field, hint, submit } from "@amends-dev/design/control"
import { detailList, person } from "@amends-dev/design/details"
import { form } from "@amends-dev/design/form"
import { paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { memberMark } from "../../../seen.ts"
import { SettingsBlock } from "../block.ts"
import type { SettingsViewBuilder } from "../composition.ts"
import {
  creatorOf,
  isNameChanged,
  type MemberItem,
  Message,
  type Model,
  mayRename,
  mayTransferOwnership,
  ownerOf,
  transferCandidates,
  workspaceName,
  workspaceNameDraft
} from "../definition.ts"
import { displayName } from "../wording.ts"
import { failureView } from "./feedback.ts"
import { settingsPage } from "./page.ts"

/** "6f942c11…5b62": the start and end of a long ID. */
const shortId = (id: string): string => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id)

/**
 * The form that renames the workspace, where the person may; for another, the name alone, and who may rename it.
 */
const nameForm = (model: Model, h: SettingsViewBuilder): Html => {
  const isEditable = mayRename(model)
  const isSaving = Option.exists(model.workspaceName, ({ isSaving }) => isSaving)
  const name = workspaceNameDraft(model)

  return form(h, { onSubmit: Message.SubmittedWorkspaceName(), label: "Workspace name", variant: "pane" }, [
    field(
      h,
      {
        id: "workspace-name",
        label: "Workspace name",
        type: "text",
        value: name,
        hint: isEditable ? "This name is shown throughout your workspace." : "Only the workspace owner can rename it.",
        isAutofocus: false,
        isDisabled: !isEditable || isSaving,
        onInput: (name) => Message.TypedWorkspaceName({ name })
      },
      Option.none()
    ),
    failureView(
      Option.flatMap(model.workspaceName, ({ failure }) => failure),
      h
    ),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save changes", { isDisabled: !isNameChanged(name, workspaceName(model)) || isSaving })
          ])
        ]
      : [])
  ])
}

/** The workspace's ID, which the person copies, and who made it. */
const detailsSection = (model: Model, id: string, h: SettingsViewBuilder): Html => {
  const creator = creatorOf(model)

  return paneSection(h, {
    title: "Details",
    hasStitch: true,
    children: [
      detailList(h, [
        {
          label: "Workspace ID",
          value: buttonRow(h, [
            h.span([h.Title(id)], [shortId(id)]),
            button(h, Option.isSome(model.copiedAttempt) ? "Copied" : "Copy ID", Message.ClickedCopyId(), {
              variant: "quiet",
              name: "Copy workspace ID"
            })
          ])
        },
        ...Option.match(creator, {
          onNone: () => [],
          onSome: (item) => [
            {
              label: "Created by",
              value: person(h, { mark: memberMark(item.member), markSize: "sm", name: item.member.name })
            }
          ]
        })
      ])
    ]
  })
}

/**
 * Who owns the workspace, and that it has one owner; and, for the owner, what handing it over means and the button that
 * opens the choice of the new owner, which waits for someone to be invited when there is no one to choose.
 */
const ownershipSection = (model: Model, owner: MemberItem, h: SettingsViewBuilder): Html => {
  const mayTransfer = mayTransferOwnership(model)
  const hasCandidates = transferCandidates(model).length > 0

  return paneSection(h, {
    title: "Ownership",
    hasStitch: true,
    children: [
      person(h, {
        mark: memberMark(owner.member),
        name: displayName(owner.member, model.memberId),
        detail: "Workspace owner"
      }),
      hint(
        h,
        mayTransfer && owner.member.id === model.memberId
          ? "A workspace has one owner. Transferring ownership makes you an administrator."
          : "A workspace has one owner."
      ),
      ...(mayTransfer
        ? [
            ...(hasCandidates ? [] : [hint(h, "Invite another person before transferring ownership.")]),
            buttonRow(h, [
              button(h, "Transfer ownership", Message.ClickedTransferOwnership(), { isDisabled: !hasCandidates })
            ])
          ]
        : [])
    ]
  })
}

/**
 * The Workspace page of the settings, the main content: the workspace's name, which the person renames when they
 * may, its ID and who made it, and who owns it.
 */
export const view = SettingsBlock.makeView((model, h) =>
  settingsPage(h, model, {
    title: "Workspace",
    icon: "mark-settings",
    ...(Option.exists(model.workspace, ({ pending }) => pending) ? { context: "Sending…" } : {}),
    body: [
      nameForm(model, h),
      ...Option.match(model.workspace, {
        onNone: () => [],
        onSome: ({ workspace }) => [detailsSection(model, workspace.id, h)]
      }),
      ...Option.match(ownerOf(model), {
        onNone: () => [],
        onSome: (owner) => [ownershipSection(model, owner, h)]
      })
    ]
  })
)
