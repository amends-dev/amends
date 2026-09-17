import { Schema } from "effect";

export const HumanId = Schema.NonEmptyString.pipe(Schema.brand("HumanId"));
export type HumanId = typeof HumanId.Type;

export const AgentId = Schema.NonEmptyString.pipe(Schema.brand("AgentId"));
export type AgentId = typeof AgentId.Type;

/** A stable human or agent reference, independent of workspace membership or execution. */
export const Reference = Schema.TaggedUnion({
  Human: { id: HumanId },
  Agent: { id: AgentId },
});
export type Reference = typeof Reference.Type;

export * as Identity from "./identity.ts";
