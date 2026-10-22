/** The person’s workspaces and invitations, including loading and empty states. */

import { copy, heading } from "@amends-dev/design/centered"
import { button, buttonRow, column, notice } from "@amends-dev/design/control"
import { footnote, row, rowWithButton, section } from "@amends-dev/design/directory"
import { paneEmpty } from "@amends-dev/design/pane"
import type * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { pluralize } from "../../../view/counts.ts"
import { expiryLabel } from "../../../view/time.ts"
import type { WorkspacesViewBuilder } from "../composition.ts"
import { Message, type Model, type PendingInvitation, Workspaces, workspaceRowId } from "../definition.ts"

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
        notice(h, Option.some("Couldn’t refresh your workspaces.")),
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
          art: "sew-in",
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
 * What the page says in place of its heading while the listing is on its way: the host is being asked, which
 * also checks that the session it kept still holds.
 */
const checkingSession = (h: WorkspacesViewBuilder): Html =>
  paneEmpty(h, {
    art: "working",
    title: "Checking your session",
    copy: "Connecting to your workspace host…",
    level: 1
  })

/**
 * What the page says under its heading, or in its place: that the listing is on its way, that the host was not
 * reached the first time, or what it holds.
 */
export const listing = (model: Model, now: DateTime.Utc, h: WorkspacesViewBuilder): ReadonlyArray<Html> =>
  Workspaces.match(model.workspaces, {
    Loading: () => [checkingSession(h)],
    Unreachable: () => [
      paneEmpty(h, {
        art: "lost-thread",
        title: "Can’t reach your workspace host",
        copy: "You’re still signed in. Try again once the host is running.",
        action: button(h, "Try again", Message.ClickedTryAgain(), { variant: "primary" }),
        level: 1
      })
    ],
    Loaded: ({ memberships, invitations, reloadFailed }) =>
      loadedContent(memberships, invitations, reloadFailed, now, h)
  })
