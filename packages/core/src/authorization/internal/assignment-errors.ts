/**
 * The outcomes `AssignmentService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";

/**
 * The member has been removed; roles are given to and taken from active members only.
 */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "AssignmentService.InactiveMember",
  { memberId: Member.Id },
) {}
