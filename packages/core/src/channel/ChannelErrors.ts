/**
 * The outcomes `ChannelService` and `ChannelIntake` report that a caller can act on. They are
 * schemas, so protocols carry them to clients; the services' error types add the failures of what
 * they depend on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Connection from "../connection/connection.ts";
import * as GroupId from "../group/id.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ChannelId from "./ChannelId.ts";

/**
 * The channel is missing or removed, or the actor may not read it; the three are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ChannelService.NotFound", {
  channelId: ChannelId.Id,
}) {}

/**
 * The destination group is missing, or the actor is not a member of it; the two are not told
 * apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ChannelService.GroupNotFound",
  { groupId: GroupId.Id },
) {}

/**
 * The connection is missing or removed, the actor may not read and use it, or its integration
 * gives no channels; the actor cannot tell these apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "ChannelService.ConnectionUnavailable",
  { connectionId: Connection.Id },
) {}

/**
 * The thread is missing, outside the actor's groups, or did not come through a channel; the three
 * are not told apart.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotBound extends Schema.TaggedError<NotBound>()("ChannelService.NotBound", {
  threadId: ThreadId.Id,
}) {}

/**
 * The channel's transport rejected what the host received: it is not the external system's, or
 * its signature does not hold. Nothing was taken in.
 *
 * @category errors
 * @since 0.1.0
 */
export class Rejected extends Schema.TaggedError<Rejected>()("ChannelIntake.Rejected", {
  description: Schema.String,
}) {}

/**
 * The channel cannot be reached now: its connection was removed or has no key, its integration is
 * not installed or gives no channels, or the external system could not answer. The system may send
 * again.
 *
 * @category errors
 * @since 0.1.0
 */
export class Unavailable extends Schema.TaggedError<Unavailable>()("ChannelIntake.Unavailable", {
  description: Schema.String,
}) {}
