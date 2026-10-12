/**
 * The outcomes `GroupMembershipService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's error types add the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Group from "../Group.ts";

/**
 * A direct group's members never change; including someone else needs another direct group.
 */
export class FixedMembership extends Schema.TaggedError<FixedMembership>()(
  "GroupMembershipService.FixedMembership",
  { groupId: Group.Id },
) {}

/**
 * Everyone in the workspace belongs to its general group: nobody leaves it or is removed from it.
 * Leaving the workspace ends the admission.
 */
export class GeneralMembership extends Schema.TaggedError<GeneralMembership>()(
  "GroupMembershipService.GeneralMembership",
  { groupId: Group.Id },
) {}
