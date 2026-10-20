import { copy, heading, screenContent } from "@amends-dev/design/centered"
import { button, buttonRow, column, field, hint, notice, submit } from "@amends-dev/design/control"
import { footnote, row, rowWithButton, section } from "@amends-dev/design/directory"
import { modal } from "@amends-dev/design/modal"
import { paneEmpty } from "@amends-dev/design/pane"
import { toast, toastStack } from "@amends-dev/design/toast"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { expiryLabel, pluralize } from "../../seen.ts"
import { SelectOnFocus } from "./command.ts"
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
  Workspaces,
  workspaceRowId
} from "./definition.ts"

const firstLetterOf = (name: string): string => Array.from(name).at(0) ?? ""

/** The row's second line: how many members, and that the person owns it when they do. */
const workspaceMeta = ({ workspace, member, activeMemberCount }: WorkspaceDirectory.Membership): string => {
  const members = pluralize(activeMemberCount, "member", "members")

  return workspace.ownerMemberId === member.id ? `${members} · Owner` : members
}

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
  workspaces === 0 && invitations === 0
    ? "Create a workspace to get started."
    : workspaces === 0
      ? `${pluralize(invitations, "invitation", "invitations")} waiting for you.`
      : invitations === 0
        ? pluralize(workspaces, "workspace", "workspaces")
        : `${pluralize(workspaces, "workspace", "workspaces")} · ${pluralize(invitations, "pending invitation", "pending invitations")}`

/** The button that asks to create a workspace, which the heading and an empty listing both hold. */
const createButton = (h: WorkspacesViewBuilder, variant: "secondary" | "primary"): Html =>
  button(h, "Create workspace", Message.ClickedCreate(), { variant, icon: "mark-new" })

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
                  id: workspaceRowId(membership.workspace.id),
                  mark: { text: firstLetterOf(membership.workspace.name) },
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

/**
 * The invitations waiting for the person, each to accept, while any wait, and, when they belong to no workspace
 * yet, a line that says there is another way in.
 */
const invitationsSection = (
  invitations: ReadonlyArray<PendingInvitation>,
  hasWorkspaces: boolean,
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
                  mark: { text: invitationMark(invitation) },
                  title: invitationTitle(invitation),
                  meta: invitationMeta(invitation, now),
                  action: "Accept invite",
                  actionName: `Accept invite to ${invitationTitle(invitation)}`,
                  onClick: Message.ClickedAccept({ invitationId: invitation.details.id })
                })
              ]
            )
          )
        ),
        ...(hasWorkspaces ? [] : [footnote(h, "Accept an invitation above, or create your own workspace.")])
      ]

/** The line under the heading, with, when reading the listing again failed, why the list may be old and a way to try again. */
const summaryOf = (line: string, reloadFailed: boolean, h: WorkspacesViewBuilder): Html =>
  reloadFailed
    ? column(h, [
        copy(h, line),
        notice(h, Option.some("Couldn't refresh your workspaces.")),
        buttonRow(h, [button(h, "Try again", Message.ClickedTryAgain(), { variant: "quiet" })])
      ])
    : copy(h, line)

/** What the page says once the listing was read: its counts and lists, or that there is nothing yet. */
const loadedContent = (
  memberships: ReadonlyArray<WorkspaceDirectory.Membership>,
  invitations: ReadonlyArray<PendingInvitation>,
  reloadFailed: boolean,
  now: DateTime.Utc,
  h: WorkspacesViewBuilder
): ReadonlyArray<Html> => {
  const summary = summaryOf(countLine(memberships.length, invitations.length), reloadFailed, h)

  return memberships.length === 0 && invitations.length === 0
    ? [
        heading(h, "Choose a workspace"),
        summary,
        paneEmpty(h, {
          icon: "mark-home",
          title: "No workspaces yet",
          copy: "Create a workspace for your team. Invitations will appear here.",
          action: createButton(h, "primary")
        })
      ]
    : [
        heading(h, "Choose a workspace", { action: createButton(h, "secondary") }),
        summary,
        ...workspacesSection(memberships, h),
        ...invitationsSection(invitations, memberships.length > 0, now, h)
      ]
}

/**
 * What the page says under its heading, or in its place: that the listing is on its way, that the host was not
 * reached the first time, or what it holds.
 */
const listing = (model: Model, now: DateTime.Utc, h: WorkspacesViewBuilder): ReadonlyArray<Html> =>
  Workspaces.match(model.workspaces, {
    Loading: () => [
      heading(h, "Choose a workspace", { action: createButton(h, "secondary") }),
      copy(h, "Loading your workspaces…")
    ],
    Unreachable: () => [
      paneEmpty(h, {
        icon: "mark-connections",
        title: "Can't reach your workspace host",
        copy: "You're still signed in. Try again once the host is running.",
        action: button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" }),
        level: 1
      })
    ],
    Loaded: ({ memberships, invitations, reloadFailed }) =>
      loadedContent(memberships, invitations, reloadFailed, now, h)
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
    width: "form",
    body: reloadFailed
      ? [notice(h, Option.some("Your workspace was created, but we couldn't refresh the list. Try again to open it."))]
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
    width: "form",
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
    width: "form",
    body: reloadFailed
      ? [notice(h, Option.some("Joined, but we couldn't load your workspaces. Try again."))]
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

/** What the person did that is confirmed, each with a way to dismiss it, in a live region that is there before the first. */
const toasts = (model: Model, h: WorkspacesViewBuilder): Html =>
  toastStack(
    h,
    model.toasts.map(({ id, text }) =>
      h.keyed("div")(
        `${id}`,
        [],
        [
          toast(h, {
            text,
            role: "status",
            action: { label: "Dismiss", onClick: Message.DismissedToast({ toastId: id }) }
          })
        ]
      )
    )
  )

/** The time now, which when each invitation closes is read from. */
export type ViewInputs = Readonly<{ now: DateTime.Utc }>

export const view = WorkspacesComposition.makeView.withInputs<ViewInputs>((model, { now }, h) =>
  screenContent(h, [
    ...listing(model, now, h),
    h.block(
      DialogBinding.embedView({
        slotId: "enter-workspace",
        model: model.dialog,
        viewInputs: { hasDescription: isDescribed(model), toView: (render) => enteringModal(render, model, h) }
      })
    ),
    toasts(model, h)
  ])
)
