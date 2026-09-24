import { Schema } from "effect";
import { Fact } from "../journal/fact.ts";
import { Subject } from "../journal/subject.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { Key } from "./request.ts";

/**
 * A keyed request completed, recorded in the same commit as what it created. Internal: it has no
 * audience, so the change feed never delivers it, and no projection reads it.
 */
export const Completed = Fact.make("request.completed", {
  subject: (payload) => Subject.make("request", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    workspaceId: WorkspaceId.Id,
    memberId: MemberId.Id,
    operation: Schema.NonEmptyString,
    key: Key,
    /** SHA-256 of the request's input as JSON, in hex; a retry must repeat the input exactly. */
    input: Schema.NonEmptyString,
    /** The records the request created, by ID, so that a retry returns them. */
    result: Schema.Json,
  }),
});

export * as RequestFacts from "./facts.ts";
