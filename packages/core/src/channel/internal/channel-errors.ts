/**
 * The outcomes `ChannelService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 * `ChannelService` re-exports them.
 */
import { Schema } from "effect";
import * as Connection from "../../connection/Connection.ts";

/**
 * The connection is missing or removed, the actor may not read and use it, or its integration
 * gives no channels; the actor cannot tell these apart.
 */
export class ConnectionUnavailable extends Schema.TaggedError<ConnectionUnavailable>()(
  "ChannelService.ConnectionUnavailable",
  { connectionId: Connection.Id },
) {}
