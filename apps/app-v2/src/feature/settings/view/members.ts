/** The member roster and pending invitations. */

import type { MemberId } from "@amends-dev/core/workspace"
import { button, hint, searchField } from "@amends-dev/design/control"
import { columns, row, rowWithButton, section } from "@amends-dev/design/directory"
import { choiceMenu } from "@amends-dev/design/menu"
import { paneEmpty, paneToolbar } from "@amends-dev/design/pane"
import type { Viewport } from "@amends-dev/design/viewport"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import { isAgent } from "../../../data/members.ts"
import { memberMark } from "../../../view/members.ts"
import { SettingsBlock } from "../block.ts"
import { MemberStatusBinding, type SettingsViewBuilder } from "../composition.ts"
import {
  type InvitationItem,
  type MemberItem,
  Message,
  type Model,
  mayInvite,
  pendingInvitations,
  roleLabel,
  shownMembers
} from "../definition.ts"
import { settingsPage } from "./page.ts"
import { displayName, emptyRoster, emptyRosterArt, filterChoices, invitationDetail, statusLabels } from "./wording.ts"

/**
 * A member as a row of the roster: their mark, their name, with Agent under it for an agent, their role, and their
 * status.
 */
const memberRow = (
  item: MemberItem,
  model: Model,
  openMemberId: Option.Option<MemberId.MemberId>,
  h: SettingsViewBuilder,
  memberHref?: MembersInputs["memberHref"]
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
        onClick: Message.ClickedMember({ memberId: member.id }),
        href: memberHref?.(member.id)
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
const roster = (
  model: Model,
  openMemberId: Option.Option<MemberId.MemberId>,
  h: SettingsViewBuilder,
  memberHref?: MembersInputs["memberHref"]
): Html => {
  const shown = shownMembers(model)

  return shown.length === 0
    ? paneEmpty(h, { art: emptyRosterArt(model.filter), title: emptyRoster(model.filter) })
    : h.ul(
        [h.AriaLabel(model.filter.status === "removed" ? "Removed members" : "Members")],
        shown.map((item) => memberRow(item, model, openMemberId, h, memberHref))
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
  memberHref?: ((id: MemberId.MemberId) => string | undefined) | undefined
  now: DateTime.Utc
  viewport: Viewport
  openMemberId: Option.Option<MemberId.MemberId>
}>

/**
 * The Members page of the settings, the main content: a toolbar of a search and a menu of whom to list over the
 * roster, which opens a member in the side pane, and, where the person manages invitations, Invite people in its
 * header and the invitations still to be accepted after the roster, or on a phone as a card.
 */
export const membersView = SettingsBlock.makeView.withInputs<MembersInputs>(
  (model, { now, viewport, openMemberId, memberHref }, h) => {
    const mayManageInvitations = mayInvite(model)
    const waiting = pendingInvitations(model, now)

    return settingsPage(h, model, {
      title: "Members",
      icon: "users",
      isWide: true,
      ...(mayManageInvitations ? { actions: [button(h, "Invite people", Message.ClickedInvite())] } : {}),
      toolbar: rosterToolbar(model, h),
      body: [
        roster(model, openMemberId, h, memberHref),
        ...(mayManageInvitations
          ? [viewport === "Phone" ? invitationsCard(waiting, h) : waitingInvitations(waiting, model, now, h)]
          : [])
      ]
    })
  }
)
