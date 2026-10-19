import { BuiltinRoles } from "@amends-dev/core/authorization"
import { InvitationPermissions, WorkspaceSettingsPermissions } from "@amends-dev/core/workspace"
import {
  button,
  buttonRow,
  choiceSelect,
  field,
  fieldGrid,
  hint,
  notice,
  sending,
  submit
} from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import { form, settingRow } from "@amends-dev/design/form"
import { pane, paneColumn, paneSection } from "@amends-dev/design/pane"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { may, workspaceTarget } from "../../permissions.ts"
import { initials } from "../../seen.ts"
import { SettingsComposition, type SettingsViewBuilder } from "./composition.ts"
import {
  activeMembers,
  givableRoles,
  type InvitationItem,
  isChangingRole,
  mayChangeRole,
  mayRemove,
  mayTransferTo,
  type MemberItem,
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

/** A name, with the action to change it when the person may, and the form to change it while they do. */
const nameSection = (
  h: SettingsViewBuilder,
  config: Readonly<{
    id: string
    label: string
    name: string
    copy: string
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
  paneSection(h, {
    title: config.label,
    trailing: [sending(h, config.pending)],
    children: [
      Option.match(config.draft, {
        onNone: () =>
          settingRow(h, {
            label: config.name,
            copy: config.copy,
            action: config.mayRename
              ? button(h, config.renameLabel, config.onRename, { variant: "secondary" })
              : undefined
          }),
        onSome: (draft) =>
          form(h, { onSubmit: config.onSubmit, variant: "pane" }, [
            field(
              h,
              { id: config.id, label: config.label, type: "text", value: draft, onInput: config.onInput },
              Option.none()
            ),
            buttonRow(h, [submit(h, "Save"), button(h, "Cancel", config.onCancel, { variant: "quiet" })])
          ])
      })
    ]
  })

/** The roles the person may give, each with its name, to choose from. */
const roleChoices = (model: Model) => givableRoles(model).map(({ id, name }) => [id, name] as const)

/**
 * A member with the role they hold, which the person changes when they may, and, for the members the person
 * may act on, removing them and handing them the workspace.
 */
const memberEntry = ({ member, pending }: MemberItem, model: Model, h: SettingsViewBuilder): Html => {
  const held = workspaceRolesOf(model, member.id)
  const buttons = [
    ...(mayRemove(model, member.id)
      ? [button(h, "Remove", Message.ClickedRemoveMember({ memberId: member.id }), { variant: "quiet" })]
      : []),
    ...(mayTransferTo(model, member)
      ? [button(h, "Make owner", Message.ClickedTransferOwnership({ memberId: member.id }), { variant: "quiet" })]
      : [])
  ]

  return entry(h, {
    key: member.id,
    mark: initials(member.name),
    title: member.name,
    trailing: [
      ...(mayChangeRole(model, member.id)
        ? [
            choiceSelect(
              h,
              {
                id: `role-${member.id}`,
                label: `Role of ${member.name}`,
                choices: roleChoices(model),
                value: held[0]?.source.roleId ?? BuiltinRoles.MemberId,
                onChange: (roleId) => Message.ChoseRole({ memberId: member.id, roleId })
              },
              { isLabelHidden: true }
            )
          ]
        : held.map(({ source }) => badge(h, { label: roleName(model, source.roleId) }))),
      sending(h, pending || isChangingRole(model, member.id))
    ],
    children: buttons.length === 0 ? [] : [buttonRow(h, buttons)]
  })
}

/** The workspace's members, with their roles. */
const membersSection = (model: Model, h: SettingsViewBuilder): Html =>
  paneSection(h, {
    title: "Members",
    children: [
      entryList(h, { label: "Members", children: activeMembers(model).map((item) => memberEntry(item, model, h)) })
    ]
  })

/** An invitation still to be accepted, by its address, the role it gives, and when it ends, to revoke. */
const invitationEntry = ({ invitation: { details }, pending }: InvitationItem, model: Model, h: SettingsViewBuilder) =>
  entry(h, {
    key: details.id,
    mark: initials(details.recipientEmail),
    title: details.recipientEmail,
    trailing: [
      badge(h, { label: roleName(model, details.roleId) }),
      hint(h, `until ${DateTime.formatIsoDateUtc(details.expiresAt)}`),
      sending(h, pending)
    ],
    children: pending
      ? []
      : [
          buttonRow(h, [
            button(h, "Revoke", Message.ClickedRevokeInvitation({ invitationId: details.id }), { variant: "quiet" })
          ])
        ]
  })

/** The invitations still to be accepted, and the form to invite someone by address. */
const invitationsSection = (model: Model, h: SettingsViewBuilder): Html => {
  const waiting = waitingInvitations(model)

  return paneSection(h, {
    title: "Invitations",
    children: [
      waiting.length === 0
        ? hint(h, "No invitations waiting.")
        : entryList(h, {
            label: "Invitations",
            children: waiting.map((item) => invitationEntry(item, model, h))
          }),
      form(h, { onSubmit: Message.SubmittedInvite(), label: "Invite someone", variant: "pane" }, [
        fieldGrid(h, [
          field(
            h,
            {
              id: "invite-email",
              label: "Email",
              type: "email",
              value: model.inviting.email,
              onInput: (email) => Message.TypedInviteEmail({ email }),
              isAutofocus: false
            },
            Option.none()
          ),
          choiceSelect(h, {
            id: "invite-role",
            label: "Role",
            choices: roleChoices(model),
            value: model.inviting.roleId,
            onChange: (roleId) => Message.ChoseInviteRole({ roleId })
          })
        ]),
        buttonRow(h, [submit(h, "Invite")])
      ])
    ]
  })
}

/** The workspace's settings: its name, the person's own, its members and their roles, and its invitations. */
export const view = SettingsComposition.makeView((model, h) =>
  pane(h, {
    variant: "main",
    label: "Settings",
    header: { title: "Settings", icon: "mark-settings" },
    body: [
      paneColumn(h, [
        notice(h, model.notice),
        nameSection(h, {
          id: "workspace-name",
          label: "Workspace name",
          name: workspaceName(model),
          copy: "Everyone in this workspace sees this name.",
          pending: Option.exists(model.workspace, ({ pending }) => pending),
          draft: workspaceNameDraft(model),
          mayRename: may(model.grants, WorkspaceSettingsPermissions.Rename, workspaceTarget(model.workspaceId)),
          renameLabel: "Rename workspace",
          onRename: Message.ClickedRenameWorkspace(),
          onInput: (name) => Message.TypedWorkspaceName({ name }),
          onSubmit: Message.SubmittedWorkspaceName(),
          onCancel: Message.ClickedCancelWorkspaceName()
        }),
        nameSection(h, {
          id: "own-name",
          label: "Your name",
          name: ownName(model),
          copy: "How others in this workspace see you.",
          pending: model.members.some(({ member, pending }) => pending && member.id === model.memberId),
          draft: ownNameDraft(model),
          mayRename: true,
          renameLabel: "Change your name",
          onRename: Message.ClickedRenameSelf(),
          onInput: (name) => Message.TypedOwnName({ name }),
          onSubmit: Message.SubmittedOwnName(),
          onCancel: Message.ClickedCancelOwnName()
        }),
        membersSection(model, h),
        may(model.grants, InvitationPermissions.Manage, workspaceTarget(model.workspaceId))
          ? invitationsSection(model, h)
          : h.empty
      ])
    ]
  })
)
