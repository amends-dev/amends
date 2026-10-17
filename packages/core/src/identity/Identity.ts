/**
 * Stable identities, the same across workspaces: a human's, which the host's accounts name; an
 * agent's; and a contact's, someone reached through a channel. Humans and agents can be members
 * of a workspace, and `MemberReference` names one of them; `Reference` names any of the three.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Audience from "../journal/Audience.ts"

/**
 * A person's identity, as the host's accounts name them.
 *
 * @category schemas
 * @since 0.1.0
 */
export const HumanId = Schema.NonEmptyString.pipe(Schema.brand("HumanId"))
/**
 * @category schemas
 * @since 0.1.0
 */
export type HumanId = typeof HumanId.Type

/**
 * An agent's identity, which it is a member as.
 *
 * @category schemas
 * @since 0.1.0
 */
export const AgentId = Schema.NonEmptyString.pipe(Schema.brand("AgentId"))
/**
 * @category schemas
 * @since 0.1.0
 */
export type AgentId = typeof AgentId.Type

/**
 * A contact's identity: someone a channel reaches who is not a member.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ContactId = Schema.NonEmptyString.pipe(Schema.brand("ContactId"))
/**
 * @category schemas
 * @since 0.1.0
 */
export type ContactId = typeof ContactId.Type

/**
 * Identities eligible for authentication and workspace membership.
 *
 * @category schemas
 * @since 0.1.0
 */
export const MemberReference = Schema.TaggedUnion({
  Human: { id: HumanId },
  Agent: { id: AgentId }
})
/**
 * @category schemas
 * @since 0.1.0
 */
export type MemberReference = typeof MemberReference.Type

/**
 * A person or agent's stable identity, independent of membership or transport routing.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.TaggedUnion({
  Human: MemberReference.cases.Human.fields,
  Agent: MemberReference.cases.Agent.fields,
  Contact: { id: ContactId }
})
/**
 * @category schemas
 * @since 0.1.0
 */
export type Reference = typeof Reference.Type

/**
 * A human or agent in person, across their memberships: the audience scope their own sessions
 * read.
 *
 * @category getters
 * @since 0.1.0
 */
export const audienceOf = (identity: MemberReference): Audience.Scope =>
  Audience.make(MemberReference.isAnyOf(["Human"])(identity) ? "human" : "agent", identity.id)
