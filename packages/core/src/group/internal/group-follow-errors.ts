/**
 * The outcomes `GroupFollowService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 */
import { Schema } from "effect";
import * as Group from "../Group.ts";

/**
 * A direct group's members already take part in all of its threads.
 */
export class NotFollowable extends Schema.TaggedError<NotFollowable>()(
  "GroupFollowService.NotFollowable",
  { groupId: Group.Id },
) {}
