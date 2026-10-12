/**
 * The outcomes `ChannelService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 * `ChannelService` re-exports them.
 */
import { Schema } from "effect";
import * as Connection from "../../connection/Connection.ts";
import * as GroupId from "../../group/GroupId.ts";
import * as ThreadId from "../../thread/ThreadId.ts";
import * as ChannelId from "../ChannelId.ts";

/**
 * The channel is missing or removed, or the actor may not read it; the three are not told apart.
 */
export class NotFound extends Schema.TaggedError<NotFound>()("ChannelService.NotFound", {
  channelId: ChannelId.Id,
}) {}

/**
 * The destination group is missing, or the actor is not a member of it; the two are not told
 * apart.
 */
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ChannelService.GroupNotFound",
  { groupId: GroupId.Id },
) {}

/**
 * The connection is missing or removed, the actor may not read and use it, or its integration
 * gives no channels; the actor cannot tell these apart.
 */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "ChannelService.ConnectionUnavailable",
  { connectionId: Connection.Id },
) {}

/**
 * The thread is missing, outside the actor's groups, or did not come through a channel; the three
 * are not told apart.
 */
export class NotBound extends Schema.TaggedError<NotBound>()("ChannelService.NotBound", {
  threadId: ThreadId.Id,
}) {}
