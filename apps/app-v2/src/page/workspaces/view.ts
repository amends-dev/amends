import type { Workspace } from "@amends-dev/core/workspace"
import { copy, heading, screenContent } from "@amends-dev/design/centered"
import { button, buttonRow, column, field, hint, notice, submit } from "@amends-dev/design/control"
import { row, rowWithButton, section } from "@amends-dev/design/directory"
import { modal } from "@amends-dev/design/modal"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { expiryLabel, pluralize } from "../../seen.ts"
import { DialogBinding, WorkspacesComposition, type WorkspacesViewBuilder } from "./composition.ts"
import {
  Creating,
  type FormErrors,
  Message,
  type Model,
  noFormErrors,
  type PendingInvitation,
  Workspaces
} from "./definition.ts"

const firstLetterOf = (name: string): string => Array.from(name).at(0) ?? ""

/** The row's second line: how many members, that the person owns it when they do, and the name they go by in it. */
const workspaceMeta = ({ workspace, member, activeMemberCount }: WorkspaceDirectory.Membership): string =>
  [
    pluralize(activeMemberCount, "member", "members"),
    ...(workspace.ownerMemberId === member.id ? ["Owner"] : []),
    `as ${member.name}`
  ].join(" · ")

/** What the invitation is called when the directory found no record of its workspace. */
const unnamedInvitation = "Workspace invitation"

const invitationTitle = ({ workspaceName }: PendingInvitation): string => workspaceName ?? unnamedInvitation

/** The workspace's first letter, or a question mark while its name is not known. */
const invitationMark = ({ workspaceName }: PendingInvitation): string =>
  workspaceName === undefined ? "?" : firstLetterOf(workspaceName)

/** The row's second line: that the invitation is waiting, and when it closes. */
const invitationMeta = ({ details }: PendingInvitation, now: DateTime.Utc): string =>
  `Pending invitation · ${expiryLabel(details.expiresAt, now)}`

/** What the line under the heading counts: the workspaces and the invitations waiting, whichever there are. */
const countLine = (workspaces: number, invitations: number): string =>
  workspaces === 0
    ? `${pluralize(invitations, "invitation", "invitations")} waiting for you.`
    : invitations === 0
      ? pluralize(workspaces, "workspace", "workspaces")
      : `${pluralize(workspaces, "workspace", "workspaces")} · ${pluralize(invitations, "pending invitation", "pending invitations")}`

/** The workspaces the person belongs to, each to open, while they belong to any. */
const workspacesSection = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  h: WorkspacesViewBuilder
): ReadonlyArray<Html> =>
  memberships.length === 0
    ? []
    : [
        section(h, { label: "Your workspaces", count: memberships.length }),
        h.ul(
          [h.AriaLabel("Workspaces")],
          memberships.map((membership) =>
            h.keyed("li")(
              membership.workspace.id,
              [],
              [
                row(h, {
                  mark: firstLetterOf(membership.workspace.name),
                  title: membership.workspace.name,
                  meta: workspaceMeta(membership),
                  action: "Open →",
                  onClick: Message.ClickedWorkspace({ workspaceId: membership.workspace.id })
                })
              ]
            )
          )
        )
      ]

/** The invitations waiting for the person, each to accept, while any wait. */
const invitationsSection = (
  invitations: ReadonlyArray<PendingInvitation>,
  now: DateTime.Utc,
  h: WorkspacesViewBuilder
): ReadonlyArray<Html> =>
  invitations.length === 0
    ? []
    : [
        section(h, { label: "Invitations", count: invitations.length }),
        h.ul(
          [h.AriaLabel("Invitations")],
          invitations.map((invitation) =>
            h.keyed("li")(
              invitation.details.id,
              [],
              [
                rowWithButton(h, {
                  mark: invitationMark(invitation),
                  title: invitationTitle(invitation),
                  meta: invitationMeta(invitation, now),
                  action: "Accept invite",
                  actionName: `Accept invite to ${invitationTitle(invitation)}`,
                  onClick: Message.ClickedAccept({ invitationId: invitation.details.id })
                })
              ]
            )
          )
        )
      ]

/**
 * What the listing says under the heading: that it is on its way, why it was not reached, or what it counts, the
 * workspaces and the invitations.
 */
const listing = (model: Model, now: DateTime.Utc, h: WorkspacesViewBuilder): ReadonlyArray<Html> =>
  Workspaces.match(model.workspaces, {
    Loading: () => [copy(h, "Loading your workspaces…")],
    Failed: ({ error }) => [
      column(h, [
        notice(h, Option.some(error)),
        buttonRow(h, [button(h, "Try again", Message.ClickedTryAgain(), { variant: "quiet" })])
      ])
    ],
    Loaded: ({ memberships, invitations }) =>
      memberships.length === 0 && invitations.length === 0
        ? [copy(h, "You belong to no workspace yet."), copy(h, "Create one to get started.")]
        : [
            copy(h, countLine(memberships.length, invitations.length)),
            ...workspacesSection(memberships, h),
            ...invitationsSection(invitations, now, h)
          ]
  })

const createTitle = "Create workspace"

const createDescription = "A shared place for your team."

/** The modal for the names of the workspace, while the person fills them in or the request is on its way. */
const formModal = (
  render: RenderInfo,
  names: Readonly<{ name: string; memberName: string }>,
  errors: FormErrors,
  isSending: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: createTitle,
    description: createDescription,
    width: "form",
    body: [
      field(
        h,
        {
          id: "workspace-name",
          label: "Workspace name",
          type: "text",
          value: names.name,
          hint: "You'll be the owner of this workspace.",
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
          hint: "What people there will call you.",
          onInput: (memberName) => Message.TypedMemberName({ memberName }),
          isAutofocus: false
        },
        errors.memberName
      ),
      notice(h, errors.form),
      isSending ? hint(h, "Creating your workspace…") : h.empty
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, createTitle, { isDisabled: isSending })],
    onSubmit: Message.SubmittedCreate()
  })

/** The modal for the workspace once it exists, while the listing is read again to open it, or when that failed. */
const openingModal = (
  render: RenderInfo,
  workspace: Workspace.Workspace,
  reloadFailed: boolean,
  h: WorkspacesViewBuilder
): Html =>
  modal(h, render, {
    title: createTitle,
    description: createDescription,
    width: "form",
    body: reloadFailed
      ? [
          notice(h, Option.some(`${workspace.name} was created, but your workspaces could not be reloaded.`), {
            tone: "caution"
          })
        ]
      : [hint(h, `Opening ${workspace.name}…`)],
    ...(reloadFailed
      ? { cancelLabel: "Close", footer: [button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" })] }
      : {})
  })

/**
 * The modal for creating a workspace. While nothing is being created the dialog has no content to show, so it is
 * an empty frame.
 */
const createModal = (render: RenderInfo, model: Model, h: WorkspacesViewBuilder): Html =>
  Option.match(model.create, {
    onNone: () => modal(h, render, { title: "", body: [] }),
    onSome: Creating.match({
      Filling: ({ name, memberName, errors }) => formModal(render, { name, memberName }, errors, false, h),
      Sending: ({ name, memberName }) => formModal(render, { name, memberName }, noFormErrors, true, h),
      Opening: ({ workspace, reloadFailed }) => openingModal(render, workspace, reloadFailed, h)
    })
  })

/** The time now, which when each invitation closes is read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

export const view = WorkspacesComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  screenContent(h, [
    heading(h, "Choose a workspace", {
      action: button(h, "Create workspace", Message.ClickedCreate(), { icon: "mark-new" })
    }),
    ...listing(model, now, h),
    h.block(
      DialogBinding.embedView({
        slotId: "create-workspace",
        model: model.dialog,
        viewInputs: { hasDescription: true, toView: (render) => createModal(render, model, h) }
      })
    )
  ])
)
