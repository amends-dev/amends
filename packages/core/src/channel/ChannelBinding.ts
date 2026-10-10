/**
 * A binding ties a thread to the external conversation it came from: one row keyed by the thread,
 * set when the thread is created and never changed, unique on the channel and the conversation. It
 * is where replies in the thread are delivered to, and how a later message in the conversation finds
 * its thread. A fact with a projection and no activity, like the thread's creation.
 *
 * @since 0.1.0
 */
import { ChannelTransport } from "@amends/connection";
import { Schema } from "effect";
import { GroupId } from "../group/id.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { ChannelId } from "./ChannelId.ts";

/**
 * A thread's binding to the external conversation it came from.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Record = Schema.Struct({
  threadId: ThreadId.Id,
  workspaceId: WorkspaceId.Id,
  channelId: ChannelId.Id,
  /** The thread's group, copied so that the fact's audience follows from its payload. */
  groupId: GroupId.Id,
  /**
   * The external conversation, as the channel's transport identifies it and with what the
   * transport needs to post there, kept as the transport gave it.
   */
  conversation: ChannelTransport.Conversation,
  boundAt: Schema.DateTimeUtcFromString,
});

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as ChannelBinding from "./ChannelBinding.ts";
