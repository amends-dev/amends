/**
 * The card a member's mark, name, or mention opens, as `apps/ui` draws it: who they are, what they are, and what the
 * person can do about them, on a popover placed against what opened it. One card is open at a time in the workspace:
 * opening another replaces it. The Block reads the member it shows from the person's store and reports what the person
 * chose on the card: to message a person, to open an agent, or to change their own name.
 */

import { Identity } from "@amends-dev/core/identity"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { logoMotions } from "@amends-dev/design/logo"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** How a member stands, as the patch on their mark and the words after what they are say it. */
export const Standing = Schema.Struct({
  kind: Schema.Literals(["available", "offline", "attention", "blocked"]),
  label: Schema.String,
  detail: Schema.Option(Schema.String)
})
export type Standing = typeof Standing.Type

/**
 * A member as the card shows them: who they are, their name, whether they are a person or an agent, whether they are
 * the person and whether they left the workspace, the agent they are, if they are one, and for an agent how it stands
 * and how its logo moves while it is at work.
 */
export const MemberProfile = Schema.Struct({
  memberId: MemberId.MemberId,
  name: Schema.String,
  kind: Schema.Literals(["Person", "Agent"]),
  isYou: Schema.Boolean,
  isFormer: Schema.Boolean,
  agentId: Schema.Option(Identity.AgentId),
  standing: Schema.Option(Standing),
  motion: Schema.Option(Schema.Literals(logoMotions))
})
export type MemberProfile = typeof MemberProfile.Type

/**
 * The card of the `subject`, the ID of a member as the trigger `triggerId` has it, which opened the card and which it
 * is placed against and returns the focus to: not open; open, while the member is read; or showing the member, whose
 * `profile` is none when the workspace has no such member or they cannot be read. A mention in a text names its member
 * by whatever ID the text was written with, so the subject is not known to be a member's.
 */
export const Card = defineTaggedUnion({
  Closed: {},
  Reading: { subject: Schema.String, triggerId: Schema.String },
  Showing: { subject: Schema.String, triggerId: Schema.String, profile: Schema.Option(MemberProfile) }
})
export type Card = typeof Card.Type

export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  card: Card
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  RequestedOpen: { memberId: Schema.String, triggerId: Schema.String },
  ReceivedProfile: { profile: Schema.Option(MemberProfile) },
  RequestedClose: {},
  LeftCard: {},
  ClickedMessage: {},
  ClickedOpenAgent: {},
  ClickedChangeName: {},
  CompletedAnchorProfileCard: {},
  CompletedFocusTrigger: {}
})
export type Message = typeof Message.Type

/**
 * What the Block asks of the page: to open a conversation with a person, to open an agent's page, or to change the
 * person's own name.
 */
export const OutMessage = defineMessageUnion({
  OpenedPerson: { memberId: MemberId.MemberId },
  OpenedAgent: { agentId: Identity.AgentId },
  RequestedNameChange: {}
})
export type OutMessage = typeof OutMessage.Type

export const ProfileCardDefinition = Block.makeDefinition("ProfileCard", { Model, Message, OutMessage })

/**
 * The trigger whose card is open or being read, none while it is closed: what the panes' triggers say is expanded, and
 * what the card returns the focus to.
 */
export const openTriggerIdOf = (model: Model): string | undefined =>
  Card.matchOrElse(
    model.card,
    {
      Reading: ({ triggerId }) => triggerId,
      Showing: ({ triggerId }) => triggerId
    },
    () => undefined
  )
