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
  Entering,
  type FormErrors,
  type JoinErrors,
  Message,
  type Model,
  noFormErrors,
  noJoinErrors,
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

/** What the invitation's workspace is called in the title of its dialog, as far as it is known. */
const joinTitle = (invitation: PendingInvitation): string => `Join ${invitation.workspaceName ?? "workspace"}`

const joinDescription = "Choose what people there will call you."

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
    width: "form",
    body: [
      field(
        h,
        {
          id: "join-name",
          label: "Your name",
          type: "text",
          value: name,
          hint: "What people there will call you.",
          onInput: (typed) => Message.TypedJoinName({ name: typed }),
          isAutofocus: false,
          attributes: render.initialFocus
        },
        errors.name
      ),
      notice(h, errors.form),
      isSending ? hint(h, "Joining…") : h.empty
    ],
    cancelLabel: "Cancel",
    footer: [submit(h, "Join workspace", { isDisabled: isSending })],
    onSubmit: Message.SubmittedJoin()
  })

/**
 * The modal for the workspace once the person is in it, created or joined, while the listing is read again to
 * open it, or when that failed. It is the workspace's own name over what is happening, since it is the same
 * whichever way the person came.
 */
const openingModal = (
  render: RenderInfo,
  workspaceName: Option.Option<string>,
  reloadFailed: boolean,
  h: WorkspacesViewBuilder
): Html => {
  const called = Option.getOrElse(workspaceName, () => "the workspace")

  return modal(h, render, {
    title: Option.getOrElse(workspaceName, () => "Workspace"),
    width: "form",
    body: reloadFailed
      ? [notice(h, Option.some(`You're in ${called}, but your workspaces could not be reloaded.`), { tone: "caution" })]
      : [hint(h, `Opening ${called}…`)],
    ...(reloadFailed
      ? { cancelLabel: "Close", footer: [button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" })] }
      : {})
  })
}

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
      FillingJoin: ({ invitation, name, errors }) => joinFormModal(render, invitation, name, errors, false, h),
      SendingJoin: ({ invitation, name }) => joinFormModal(render, invitation, name, noJoinErrors, true, h),
      Opening: ({ workspaceName, reloadFailed }) => openingModal(render, workspaceName, reloadFailed, h)
    })
  })

/** Whether the dialog has a line that describes it: the forms do, and opening the workspace does not. */
const isDescribed = (model: Model): boolean => !Option.exists(model.entering, Entering.isAnyOf(["Opening"]))

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
        slotId: "enter-workspace",
        model: model.dialog,
        viewInputs: { hasDescription: isDescribed(model), toView: (render) => enteringModal(render, model, h) }
      })
    )
  ])
)
