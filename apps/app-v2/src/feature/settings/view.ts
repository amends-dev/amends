import type { MemberId } from "@amends-dev/core/workspace"
import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  hint,
  loadingLine,
  notice,
  searchField,
  submit
} from "@amends-dev/design/control"
import { detailList, entry, entryList, person } from "@amends-dev/design/details"
import { columns, historyRow, row, rowWithButton, section, summary } from "@amends-dev/design/directory"
import { form } from "@amends-dev/design/form"
import type { IconName } from "@amends-dev/design/icon"
import { choiceMenu, type MenuGroup } from "@amends-dev/design/menu"
import { modal } from "@amends-dev/design/modal"
import {
  pane,
  paneBack,
  paneClose,
  paneColumn,
  paneEmpty,
  paneForm,
  paneSection,
  paneToolbar
} from "@amends-dev/design/pane"
import { railAccount } from "@amends-dev/design/rail"
import type { Viewport } from "@amends-dev/design/viewport"
import type { RenderInfo } from "@foldkit/ui/dialog"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type { Appearance } from "../../appearance.ts"
import { initials, isAgent, memberMark } from "../../seen.ts"
import { SelectOnFocus } from "./command.ts"
import {
  AccountBinding,
  DialogBinding,
  MemberStatusBinding,
  SettingsComposition,
  type SettingsViewBuilder
} from "./composition.ts"
import {
  type AccountEntry,
  accessOf,
  creatorOf,
  Entering,
  type Failure,
  findMember,
  givableRoles,
  invitationHistory,
  invitationStatus,
  isChangingRole,
  isNameChanged,
  isRoleChanged,
  type InvitationItem,
  type MemberItem,
  Message,
  type Model,
  mayChangeRole,
  mayInvite,
  mayReadAccess,
  mayRemove,
  mayRename,
  mayTransferOwnership,
  ownerOf,
  ownName,
  pendingInvitations,
  roleDraftOf,
  roleLabel,
  type Selected,
  shownMembers,
  transferCandidates,
  workspaceName,
  workspaceNameDraft
} from "./definition.ts"
import {
  accessDetail,
  accessName,
  displayName,
  emptyRoster,
  emptyRosterArt,
  filterChoices,
  invitationDetail,
  invitationStatusLabels,
  needsRefresh,
  settingsMessage,
  statusLabels
} from "./wording.ts"

/** What the settings say when they could not be read, which refreshing reads again. */
const unreadable: Failure = { action: "Read", reason: "Outdated" }

/**
 * What went wrong with an action or a read, for the place it was made, with a way to refresh when what the person
 * sees is out of date.
 */
const failureView = (failure: Option.Option<Failure>, h: SettingsViewBuilder): Html =>
  Option.match(failure, {
    onNone: () => h.empty,
    onSome: (failed) =>
      needsRefresh(failed.reason)
        ? column(h, [
            notice(h, Option.some(settingsMessage(failed))),
            buttonRow(h, [button(h, "Refresh", Message.ClickedRefresh(), { variant: "quiet" })])
          ])
        : notice(h, Option.some(settingsMessage(failed)))
  })

/**
 * A page of the settings, the main content: titled, with the workspace's name under the title on phones, the toolbar
 * of a list once the workspace is read, and, while it is not, what says so, or that it could not be, with a way to try
 * again.
 */
const settingsPage = (
  h: SettingsViewBuilder,
  model: Model,
  config: Readonly<{
    title: string
    icon: IconName
    context?: string
    actions?: ReadonlyArray<Html>
    toolbar?: ReadonlyArray<Html>
    isWide?: boolean
    body: ReadonlyArray<Html>
  }>
): Html => {
  const name = workspaceName(model)

  return pane(h, {
    variant: "main",
    label: config.title,
    header: {
      title: config.title,
      icon: config.icon,
      ...(name === "" ? {} : { phoneContext: name }),
      ...(config.context === undefined ? {} : { context: config.context }),
      ...(config.actions === undefined ? {} : { actions: config.actions })
    },
    ...(config.toolbar === undefined || Option.isNone(model.workspace) ? {} : { toolbar: config.toolbar }),
    body: [
      Option.isSome(model.workspace)
        ? paneColumn(
            h,
            [failureView(model.isUnreadable ? Option.some(unreadable) : Option.none(), h), ...config.body],
            {
              isWide: config.isWide === true
            }
          )
        : model.isUnreadable
          ? paneEmpty(h, {
              art: "came-apart",
              title: "Can’t load settings",
              copy: "Try again once the host is reachable.",
              action: button(h, "Try again", Message.ClickedRefresh())
            })
          : loadingLine(h, "Loading settings…")
    ]
  })
}

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
export const view = SettingsComposition.makeView((model, h) =>
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

/**
 * A member as a row of the roster: their mark, their name, with Agent under it for an agent, their role, and their
 * status.
 */
const memberRow = (
  item: MemberItem,
  model: Model,
  openMemberId: Option.Option<MemberId.MemberId>,
  h: SettingsViewBuilder
): Html => {
  const { member, pending } = item
  const role = roleLabel(model, member.id)
  const status = statusLabels[member.status]
  const kind = [...(isAgent(member) ? ["Agent"] : []), ...(pending ? ["Sending…"] : [])].join(" · ")

  return h.keyed("li")(
    member.id,
    [],
    [
      row(h, {
        mark: memberMark(item.member),
        markSize: "md",
        isCompact: true,
        title: displayName(member, model.memberId),
        ...(kind === "" ? {} : { meta: kind }),
        cells: [h.span([], [role]), h.span([], [status])],
        cellsText: [role, status].filter((part) => part !== "").join(" · "),
        isCurrent: Option.contains(openMemberId, member.id),
        onClick: Message.ClickedMember({ memberId: member.id })
      })
    ]
  )
}

/**
 * The roster's toolbar: the search, and at its end whether the roster lists those who are in the workspace or who left,
 * then the labels of the columns over a roster that has someone to show.
 */
const rosterToolbar = (model: Model, h: SettingsViewBuilder): ReadonlyArray<Html> => [
  paneToolbar(h, {
    start: [
      searchField(h, {
        id: "member-search",
        label: "Search members",
        placeholder: "Search members…",
        value: model.filter.query,
        onInput: (query) => Message.TypedMemberQuery({ query })
      })
    ],
    end: [
      choiceMenu(h, {
        choices: filterChoices,
        value: model.filter.status,
        placement: "bottom-end",
        embed: (viewInputs) =>
          h.block(MemberStatusBinding.embedView({ slotId: "member-status", model: model.statusMenu, viewInputs }))
      })
    ]
  }),
  ...(shownMembers(model).length === 0 ? [] : [columns(h, { label: "Member", cells: ["Workspace role", "Status"] })])
]

/** The roster, or what it says when it has no one to show. */
const roster = (model: Model, openMemberId: Option.Option<MemberId.MemberId>, h: SettingsViewBuilder): Html => {
  const shown = shownMembers(model)

  return shown.length === 0
    ? paneEmpty(h, { art: emptyRosterArt(model.filter), title: emptyRoster(model.filter) })
    : h.ul(
        [h.AriaLabel(model.filter.status === "removed" ? "Removed members" : "Members")],
        shown.map((item) => memberRow(item, model, openMemberId, h))
      )
}

/** An invitation still to be accepted as a row: its address over what it gives and when it ends, with Revoke. */
const invitationRow = (item: InvitationItem, model: Model, now: DateTime.Utc, h: SettingsViewBuilder): Html => {
  const { details } = item.invitation

  return h.keyed("li")(
    details.id,
    [],
    [
      rowWithButton(h, {
        mark: { icon: "mark-mail" },
        markSize: "md",
        title: details.recipientEmail,
        meta: invitationDetail(item, model, now),
        action: "Revoke",
        actionName: `Revoke invitation for ${details.recipientEmail}`,
        variant: "quiet",
        isDisabled: item.pending,
        onClick: Message.ClickedRevoke({ invitationId: details.id })
      })
    ]
  )
}

/** The invitations still to be accepted, each to revoke, and the way to every invitation there has been. */
const waitingInvitations = (
  waiting: ReadonlyArray<InvitationItem>,
  model: Model,
  now: DateTime.Utc,
  h: SettingsViewBuilder
): Html =>
  h.section(
    [h.AriaLabel("Pending invitations")],
    [
      section(h, {
        label: "Pending invitations",
        count: waiting.length,
        action: button(h, "View history", Message.ClickedViewHistory(), { variant: "quiet" })
      }),
      waiting.length === 0
        ? hint(h, "No invitations are waiting.")
        : h.ul(
            [h.AriaLabel("Pending invitations")],
            waiting.map((item) => invitationRow(item, model, now, h))
          )
    ]
  )

/** On a phone, the invitations still to be accepted as one card, which opens every invitation there has been. */
const invitationsCard = (waiting: ReadonlyArray<InvitationItem>, h: SettingsViewBuilder): Html =>
  h.section(
    [h.AriaLabel("Invitations")],
    [
      section(h, { label: "Invitations", count: waiting.length }),
      row(h, {
        mark: { icon: "mark-mail" },
        markSize: "md",
        title: waiting.length === 1 ? "1 pending invitation" : `${waiting.length} pending invitations`,
        meta: "View and manage invitations",
        onClick: Message.ClickedViewHistory()
      })
    ]
  )

/**
 * What the Members page is given besides the model: the time now, which invitations end by, the window's width, and
 * the member the page has open beside the roster, whose row is current.
 */
export type MembersInputs = Readonly<{
  now: DateTime.Utc
  viewport: Viewport
  openMemberId: Option.Option<MemberId.MemberId>
}>

/**
 * The Members page of the settings, the main content: a toolbar of a search and a menu of whom to list over the
 * roster, which opens a member in the side pane, and, where the person manages invitations, Invite people in its
 * header and the invitations still to be accepted after the roster, or on a phone as a card.
 */
export const membersView = SettingsComposition.makeView.withInputs<MembersInputs>(
  (model, { now, viewport, openMemberId }, h) => {
    const mayManageInvitations = mayInvite(model)
    const waiting = pendingInvitations(model, now)

    return settingsPage(h, model, {
      title: "Members",
      icon: "users",
      isWide: true,
      ...(mayManageInvitations ? { actions: [button(h, "Invite people", Message.ClickedInvite())] } : {}),
      toolbar: rosterToolbar(model, h),
      body: [
        roster(model, openMemberId, h),
        ...(mayManageInvitations
          ? [viewport === "Phone" ? invitationsCard(waiting, h) : waitingInvitations(waiting, model, now, h)]
          : [])
      ]
    })
  }
)

const appearances = ["System", "Light", "Dark"] as const satisfies ReadonlyArray<Appearance>

/** The account menu's choices: the Appearances, the entries that go somewhere, and the one that ends the session. */
const accountGroups = (appearance: Appearance): ReadonlyArray<MenuGroup<AccountEntry>> => [
  {
    label: "Appearance",
    choices: appearances.map((value) => ({ value, label: value, isChecked: value === appearance }))
  },
  {
    choices: [
      { value: "SwitchWorkspace", label: "Switch workspace" },
      { value: "WorkspaceSettings", label: "Workspace settings" },
      { value: "ChangeName", label: "Change your name…" }
    ]
  },
  { choices: [{ value: "SignOut", label: "Sign out" }] }
]

/** What the account menu is given besides the model: the address the person signed in with, and their Appearance. */
export type AccountInputs = Readonly<{ email: string; appearance: Appearance }>

/**
 * The person's account at the foot of the rail: their initials, and a menu that names them over the address they
 * signed in with, which they choose their Appearance from, and which goes to another workspace, to the workspace's
 * settings, to the dialog that changes their name, and out. Before the replica holds their name, it names them by
 * their address.
 */
export const accountView = SettingsComposition.makeView.withInputs<AccountInputs>((model, { email, appearance }, h) => {
  const name = ownName(model)
  const hasName = name !== ""

  return railAccount(h, {
    name: hasName ? name : email,
    initials: initials(hasName ? name : email),
    header: hasName ? { title: name, detail: email } : { title: email },
    groups: accountGroups(appearance),
    embed: (viewInputs) =>
      h.block(AccountBinding.embedView({ slotId: "account", model: model.accountMenu, viewInputs }))
  })
})

/** The roles the person may give, each with its name, to choose from. */
const roleChoices = (model: Model) => givableRoles(model).map(({ id, name }) => [id, name] as const)

/** The form that changes the role of the member open, where the person may. */
const roleForm = (model: Model, selected: Selected, h: SettingsViewBuilder): Html =>
  paneForm(h, { title: "Workspace role", onSubmit: Message.SubmittedRole() }, [
    choiceSelect(
      h,
      {
        id: "member-role",
        label: "Workspace role",
        choices: roleChoices(model),
        value: roleDraftOf(model, selected),
        hint: "Changing the workspace role keeps any separate permissions in place.",
        isDisabled: selected.isSaving,
        onChange: (roleId) => Message.ChoseRole({ roleId })
      },
      { isLabelHidden: true }
    ),
    failureView(selected.failure, h),
    buttonRow(h, [submit(h, "Save role", { isDisabled: !isRoleChanged(model, selected) || selected.isSaving })])
  ])

/** What the member has been assigned, a role or a permission, each with where it reaches and whether it still does. */
const accessSection = (model: Model, selected: Selected, h: SettingsViewBuilder): Html => {
  const access = accessOf(model, selected.memberId)

  return paneSection(h, {
    title: "Access",
    hasStitch: true,
    children: [
      access.length === 0
        ? hint(h, "No access is assigned.")
        : entryList(h, {
            label: "Access",
            children: access.map(({ assignment }) =>
              entry(h, {
                key: assignment.id,
                title: accessName(model, assignment),
                children: [hint(h, accessDetail(assignment))]
              })
            )
          })
    ]
  })
}

/**
 * The side pane of the member open: who they are, their role, their access, and what has become of their membership.
 */
const memberPane = (model: Model, selected: Selected, item: MemberItem, h: SettingsViewBuilder): Html => {
  const { member } = item
  const detail = [
    isAgent(member) ? "Agent" : "Person",
    statusLabels[member.status],
    ...(item.pending || isChangingRole(model, member.id) ? ["Sending…"] : [])
  ].join(" · ")

  return pane(h, {
    variant: "side",
    label: "Member details",
    header: {
      title: "Member details",
      leading: paneBack(h, Message.ClickedCloseMember(), "Back to Members"),
      actions: [paneClose(h, Message.ClickedCloseMember())],
      subtitle: workspaceName(model)
    },
    body: [
      paneColumn(h, [
        person(h, { mark: memberMark(item.member), name: displayName(member, model.memberId), detail }),
        member.status === "active" && mayChangeRole(model, member.id) ? roleForm(model, selected, h) : h.empty,
        mayReadAccess(model, member.id) ? accessSection(model, selected, h) : h.empty,
        paneSection(h, {
          title: "Membership",
          hasStitch: true,
          children:
            member.status === "removed"
              ? [hint(h, "This membership has ended. Invite them again to rejoin.")]
              : [
                  ...(mayRemove(model, member.id)
                    ? [
                        buttonRow(h, [
                          button(h, "Remove member", Message.ClickedRemoveMember({ memberId: member.id }), {
                            isDisabled: selected.isSaving || item.pending
                          })
                        ])
                      ]
                    : []),
                  hint(h, "Rejoining after removal requires a new invitation.")
                ]
        })
      ])
    ]
  })
}

/**
 * What the side pane says when the member open is not in the workspace's records: they may have been removed from
 * what the person can see.
 */
const missingMember = (h: SettingsViewBuilder, model: Model): Html =>
  pane(h, {
    variant: "side",
    label: "Member details",
    header: {
      title: "Member details",
      leading: paneBack(h, Message.ClickedCloseMember(), "Back to Members"),
      actions: [paneClose(h, Message.ClickedCloseMember())],
      subtitle: workspaceName(model)
    },
    body: [
      paneEmpty(h, {
        art: "lost-thread",
        title: "This member isn’t here",
        copy: "They may have been removed, or you can no longer see them."
      })
    ]
  })

/** The side pane of the member open in the settings: who they are, their role, their access, and their membership. */
export const memberView = SettingsComposition.makeView((model, h) =>
  Option.match(model.selected, {
    onNone: () => h.empty,
    onSome: (selected) =>
      Option.match(findMember(model, selected.memberId), {
        onNone: () => missingMember(h, model),
        onSome: (item) => memberPane(model, selected, item, h)
      })
  })
)

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
export const dialogView = SettingsComposition.makeView.withInputs<DialogInputs>((model, { now }, h) =>
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
