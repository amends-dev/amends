import { BuiltinRoles } from "@amends-dev/core/authorization"
import { InvitationPermissions, WorkspaceSettingsPermissions } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { button, choiceSelect, errorView, field, sending, submit } from "../../controls.ts"
import { may, workspaceTarget } from "../../permissions.ts"
import { SettingsComposition, type SettingsViewBuilder } from "./composition.ts"
import {
  activeMembers,
  givableRoles,
  isChangingRole,
  mayChangeRole,
  mayRemove,
  mayTransferTo,
  Message,
  type Model,
  ownName,
  ownNameDraft,
  roleName,
  waitingInvitations,
  workspaceName,
  workspaceNameDraft,
  workspaceRolesOf
} from "./definition.ts"

/** A name the person may change, and the form to change it while they do. */
const renamable = (
  h: SettingsViewBuilder,
  config: Readonly<{
    id: string
    label: string
    name: string
    pending: boolean
    draft: Option.Option<string>
    mayRename: boolean
    renameLabel: string
    onRename: Message
    onInput: (name: string) => Message
    onSubmit: Message
    onCancel: Message
  }>
): Html =>
  Option.match(config.draft, {
    onNone: () =>
      h.p(
        [],
        [
          config.name,
          sending(config.pending, h),
          config.mayRename ? button(h, config.renameLabel, config.onRename) : h.empty
        ]
      ),
    onSome: (draft) =>
      h.form(
        [h.OnSubmit(config.onSubmit)],
        [
          field(
            h,
            { id: config.id, label: config.label, type: "text", value: draft, onInput: config.onInput },
            Option.none()
          ),
          submit(h, "Save"),
          button(h, "Cancel", config.onCancel)
        ]
      )
  })

/** The roles the person may give, each with its name, to choose from. */
const roleChoices = (model: Model) => givableRoles(model).map(({ id, name }) => [id, name] as const)

/**
 * The workspace's members, with their roles, and for each the person may act on, changing their
 * role and removing them; and for the owner, handing the workspace to another person.
 */
const membersView = (model: Model, h: SettingsViewBuilder): Html => {
  const roles = roleChoices(model)
  return h.section(
    [h.AriaLabel("Workspace members")],
    [
      h.h4([], ["Members"]),
      h.ul(
        [],
        activeMembers(model).map(({ member, pending }) => {
          const held = workspaceRolesOf(model, member.id)
          return h.keyed("li")(
            member.id,
            [],
            [
              h.span([], [member.name]),
              h.span(
                [],
                held.map(({ source }) => ` · ${roleName(model, source.roleId)}`)
              ),
              sending(pending || isChangingRole(model, member.id), h),
              mayChangeRole(model, member.id)
                ? choiceSelect(h, {
                    id: `role-${member.id}`,
                    label: `Role of ${member.name}`,
                    choices: roles,
                    value: held[0]?.source.roleId ?? BuiltinRoles.MemberId,
                    onChange: (roleId) => Message.ChoseRole({ memberId: member.id, roleId })
                  })
                : h.empty,
              mayRemove(model, member.id)
                ? button(h, "Remove", Message.ClickedRemoveMember({ memberId: member.id }))
                : h.empty,
              mayTransferTo(model, member)
                ? button(h, "Make owner", Message.ClickedTransferOwnership({ memberId: member.id }))
                : h.empty
            ]
          )
        })
      )
    ]
  )
}

/** The invitations still to be accepted, and the form to invite someone by address. */
const invitationsView = (model: Model, h: SettingsViewBuilder): Html => {
  const waiting = waitingInvitations(model)
  return h.section(
    [h.AriaLabel("Invitations")],
    [
      h.h4([], ["Invitations"]),
      waiting.length === 0
        ? h.p([], ["No invitations waiting."])
        : h.ul(
            [],
            waiting.map(({ invitation: { details }, pending }) =>
              h.keyed("li")(
                details.id,
                [],
                [
                  `${details.recipientEmail} · ${roleName(model, details.roleId)}, until ${DateTime.formatIsoDateUtc(details.expiresAt)}`,
                  sending(pending, h),
                  pending ? h.empty : button(h, "Revoke", Message.ClickedRevokeInvitation({ invitationId: details.id }))
                ]
              )
            )
          ),
      h.form(
        [h.OnSubmit(Message.SubmittedInvite()), h.AriaLabel("Invite someone")],
        [
          field(
            h,
            {
              id: "invite-email",
              label: "Email",
              type: "email",
              value: model.inviting.email,
              onInput: (email) => Message.TypedInviteEmail({ email })
            },
            Option.none()
          ),
          choiceSelect(h, {
            id: "invite-role",
            label: "Role",
            choices: roleChoices(model),
            value: model.inviting.roleId,
            onChange: (roleId) => Message.ChoseInviteRole({ roleId })
          }),
          submit(h, "Invite")
        ]
      )
    ]
  )
}

/** The workspace's settings: its name, the person's own, its members and their roles, and its invitations. */
export const view = SettingsComposition.makeView((model, h) =>
  h.section(
    [h.AriaLabel("Settings")],
    [
      h.h3([], ["Settings"]),
      errorView(model.notice, h),
      h.h4([], ["Workspace name"]),
      renamable(h, {
        id: "workspace-name",
        label: "Workspace name",
        name: workspaceName(model),
        pending: Option.exists(model.workspace, ({ pending }) => pending),
        draft: workspaceNameDraft(model),
        mayRename: may(model.grants, WorkspaceSettingsPermissions.Rename, workspaceTarget(model.workspaceId)),
        renameLabel: "Rename workspace",
        onRename: Message.ClickedRenameWorkspace(),
        onInput: (name) => Message.TypedWorkspaceName({ name }),
        onSubmit: Message.SubmittedWorkspaceName(),
        onCancel: Message.ClickedCancelWorkspaceName()
      }),
      h.h4([], ["Your name"]),
      renamable(h, {
        id: "own-name",
        label: "Your name",
        name: ownName(model),
        pending: model.members.some(({ member, pending }) => pending && member.id === model.memberId),
        draft: ownNameDraft(model),
        mayRename: true,
        renameLabel: "Change your name",
        onRename: Message.ClickedRenameSelf(),
        onInput: (name) => Message.TypedOwnName({ name }),
        onSubmit: Message.SubmittedOwnName(),
        onCancel: Message.ClickedCancelOwnName()
      }),
      membersView(model, h),
      may(model.grants, InvitationPermissions.Manage, workspaceTarget(model.workspaceId))
        ? invitationsView(model, h)
        : h.empty
    ]
  )
)
