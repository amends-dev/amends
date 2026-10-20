import {
  button,
  buttonRow,
  choiceSelect,
  column,
  field,
  fieldGrid,
  hint,
  notice,
  sending,
  submit
} from "@amends-dev/design/control"
import { detailList, entry, entryList, person } from "@amends-dev/design/details"
import { columns, row } from "@amends-dev/design/directory"
import { form } from "@amends-dev/design/form"
import type { IconName } from "@amends-dev/design/icon"
import type { MarkContent } from "@amends-dev/design/mark"
import { pane, paneBack, paneClose, paneColumn, paneEmpty, paneForm, paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { initials } from "../../seen.ts"
import { SettingsComposition, type SettingsViewBuilder } from "./composition.ts"
import {
  accessOf,
  creatorOf,
  type Failure,
  findMember,
  givableRoles,
  isAgent,
  isChangingRole,
  isNameChanged,
  isRoleChanged,
  type MemberItem,
  Message,
  type Model,
  mayChangeRole,
  mayReadAccess,
  mayRename,
  ownerOf,
  ownNameDraft,
  ownName,
  roleDraftOf,
  roleLabel,
  type Selected,
  shownMembers,
  workspaceName,
  workspaceNameDraft
} from "./definition.ts"
import {
  accessDetail,
  accessName,
  displayName,
  emptyRoster,
  filterChoices,
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

/** A member's mark: their initials, on the agent's tone for an agent. */
const markOf = ({ member }: MemberItem): MarkContent => ({
  text: initials(member.name),
  tone: isAgent(member) ? "lilac" : "neutral"
})

/**
 * A page of the settings, the main content: titled, with the workspace's name under the title on phones, and, while
 * the workspace is not read, what says so, or that it could not be, with a way to try again.
 */
const settingsPage = (
  h: SettingsViewBuilder,
  model: Model,
  config: Readonly<{
    title: string
    icon: IconName
    context?: string
    actions?: ReadonlyArray<Html>
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
              icon: config.icon,
              title: "Can't load settings",
              copy: "Try again once the host is reachable.",
              action: button(h, "Try again", Message.ClickedRefresh())
            })
          : h.div([h.Role("status")], [hint(h, "Loading settings…")])
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
              variant: "quiet"
            })
          ])
        },
        ...Option.match(creator, {
          onNone: () => [],
          onSome: (item) => [
            { label: "Created by", value: person(h, { mark: markOf(item), markSize: "sm", name: item.member.name }) }
          ]
        })
      ])
    ]
  })
}

/** Who owns the workspace, and that it has one owner. */
const ownershipSection = (model: Model, owner: MemberItem, h: SettingsViewBuilder): Html =>
  paneSection(h, {
    title: "Ownership",
    hasStitch: true,
    children: [
      person(h, {
        mark: markOf(owner),
        name: displayName(owner.member, model.memberId),
        detail: "Workspace owner"
      }),
      hint(h, "A workspace has one owner.")
    ]
  })

/** The name the person goes by in the workspace, which they change here until their account has a menu of its own. */
const ownNameSection = (model: Model, h: SettingsViewBuilder): Html => {
  const isSaving = Option.exists(model.ownName, ({ isSaving }) => isSaving)
  const name = ownNameDraft(model)

  return paneSection(h, {
    title: "Your name",
    hasStitch: true,
    trailing: [
      sending(
        h,
        model.members.some(({ member, pending }) => pending && member.id === model.memberId)
      )
    ],
    children: [
      form(h, { onSubmit: Message.SubmittedOwnName(), label: "Your name", variant: "pane" }, [
        field(
          h,
          {
            id: "own-name",
            label: "Your name",
            type: "text",
            value: name,
            hint: "How others in this workspace see you.",
            isAutofocus: false,
            isDisabled: isSaving,
            isLabelHidden: true,
            onInput: (name) => Message.TypedOwnName({ name })
          },
          Option.none()
        ),
        failureView(
          Option.flatMap(model.ownName, ({ failure }) => failure),
          h
        ),
        buttonRow(h, [
          submit(h, "Save name", { variant: "secondary", isDisabled: !isNameChanged(name, ownName(model)) || isSaving })
        ])
      ])
    ]
  })
}

/**
 * The Workspace page of the settings, the main content: the workspace's name, which the person renames when they
 * may, its ID and who made it, who owns it, and, at the end, the person's own name.
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
      }),
      ownNameSection(model, h)
    ]
  })
)

/** A member as a row of the roster: their mark, their name, with Agent under it for an agent, their role, and their status. */
const memberRow = (item: MemberItem, model: Model, h: SettingsViewBuilder): Html => {
  const { member, pending } = item
  const role = roleLabel(model, member.id)
  const status = statusLabels[member.status]
  const kind = [...(isAgent(member) ? ["Agent"] : []), ...(pending ? ["Sending…"] : [])].join(" · ")

  return h.keyed("li")(
    member.id,
    [],
    [
      row(h, {
        mark: markOf(item),
        markSize: "sm",
        title: displayName(member, model.memberId),
        ...(kind === "" ? {} : { meta: kind }),
        cells: [h.span([], [role]), h.span([], [status])],
        cellsText: [role, status].filter((part) => part !== "").join(" · "),
        isCurrent: Option.exists(model.selected, ({ memberId }) => memberId === member.id),
        onClick: Message.ClickedMember({ memberId: member.id })
      })
    ]
  )
}

/** The search and the filter over the roster, then the roster, or what it says when it has no one to show. */
const roster = (model: Model, h: SettingsViewBuilder): ReadonlyArray<Html> => {
  const shown = shownMembers(model)

  return [
    fieldGrid(h, [
      field(
        h,
        {
          id: "member-search",
          label: "Search members",
          type: "search",
          value: model.filter.query,
          placeholder: "Search members…",
          isAutofocus: false,
          isLabelHidden: true,
          onInput: (query) => Message.TypedMemberQuery({ query })
        },
        Option.none()
      ),
      choiceSelect(
        h,
        {
          id: "member-filter",
          label: "Show members",
          choices: filterChoices,
          value: model.filter.status,
          onChange: (status) => Message.ChoseMemberStatus({ status })
        },
        { isLabelHidden: true }
      )
    ]),
    ...(shown.length === 0
      ? [paneEmpty(h, { icon: "users", title: emptyRoster(model.filter) })]
      : [
          columns(h, { label: "Member", cells: ["Workspace role", "Status"] }),
          h.ul(
            [h.AriaLabel(model.filter.status === "removed" ? "Removed members" : "Members")],
            shown.map((item) => memberRow(item, model, h))
          )
        ])
  ]
}

/**
 * The Members page of the settings, the main content: a search and a filter over the roster, which opens a member
 * in the side pane.
 */
export const membersView = SettingsComposition.makeView((model, h) =>
  settingsPage(h, model, { title: "Members", icon: "users", isWide: true, body: roster(model, h) })
)

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

/** The side pane of the member open: who they are, their role, their access, and what has become of their membership. */
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
        person(h, { mark: markOf(item), name: displayName(member, model.memberId), detail }),
        member.status === "active" && mayChangeRole(model, member.id) ? roleForm(model, selected, h) : h.empty,
        mayReadAccess(model, member.id) ? accessSection(model, selected, h) : h.empty,
        member.status === "removed"
          ? paneSection(h, {
              title: "Membership",
              hasStitch: true,
              children: [hint(h, "This membership has ended. Invite them again to rejoin.")]
            })
          : h.empty
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
        icon: "users",
        title: "This member isn't here",
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
