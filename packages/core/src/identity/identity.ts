import { Schema } from "effect";

export const HumanId = Schema.NonEmptyString.pipe(Schema.brand("HumanId"));
export type HumanId = typeof HumanId.Type;

export const AgentId = Schema.NonEmptyString.pipe(Schema.brand("AgentId"));
export type AgentId = typeof AgentId.Type;

export const ContactId = Schema.NonEmptyString.pipe(Schema.brand("ContactId"));
export type ContactId = typeof ContactId.Type;

/** Identities eligible for authentication and workspace membership. */
export const MemberReference = Schema.TaggedUnion({
  Human: { id: HumanId },
  Agent: { id: AgentId },
});
export type MemberReference = typeof MemberReference.Type;

/** A person or agent's stable identity, independent of membership or transport routing. */
export const Reference = Schema.TaggedUnion({
  Human: MemberReference.cases.Human.fields,
  Agent: MemberReference.cases.Agent.fields,
  Contact: { id: ContactId },
});
export type Reference = typeof Reference.Type;

export * as Identity from "./identity.ts";
