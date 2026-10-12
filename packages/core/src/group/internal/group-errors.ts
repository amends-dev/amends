/**
 * The outcomes `GroupService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Group from "../Group.ts";

/**
 * A direct group is named by its members, so it has no name to change.
 */
export class NotRenamable extends Schema.TaggedError<NotRenamable>()("GroupService.NotRenamable", {
  groupId: Group.Id,
}) {}
