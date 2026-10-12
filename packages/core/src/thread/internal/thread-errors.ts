/**
 * The outcomes `ThreadService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";

/**
 * A direct group needs the author and at least one other member.
 */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadService.DirectMembersRequired",
  {},
) {}
