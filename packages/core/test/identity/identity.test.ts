import { Identity, Performer } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { Member } from "@amends-dev/core/workspace"
import { expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"

it("contact authorship does not make a contact a member, authenticated actor, or member performer", () => {
  const contact = Identity.Reference.cases.Contact.make({
    id: Identity.ContactId.make("external-person")
  })
  expect(Schema.decodeSync(Identity.Reference)(contact)).toEqual(contact)
  expect(
    Schema.decodeSync(Performer.Reference)({
      _tag: "Identity",
      identity: contact
    })
  ).toEqual({
    _tag: "Identity",
    identity: contact
  })
  expect(Schema.decodeSync(Notification.Recipient)(contact)).toEqual(contact)
  for (const decoded of [
    // An actor's identity is a member reference.
    Schema.decodeUnknownOption(Identity.MemberReference)(contact),
    Schema.decodeUnknownOption(Member.Member)({
      id: "member",
      workspaceId: "workspace",
      identity: contact,
      status: "active"
    }),
    Schema.decodeUnknownOption(Performer.Reference)({
      _tag: "Member",
      memberId: "member",
      identity: contact
    })
  ])
    expect(decoded._tag).toBe("None")
})

it("triage is a workspace recipient without a person identity", () => {
  const triage = Notification.Recipient.cases.Triage.make({})
  expect(Schema.encodeSync(Notification.Recipient)(triage)).toEqual({ _tag: "Triage" })
  expect(Option.isNone(Schema.decodeUnknownOption(Identity.Reference)(triage))).toBe(true)
})
