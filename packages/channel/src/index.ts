/**
 * Channels that bring external conversations in: the contract every channel transport implements.
 * A transport is how one external system, such as a chat or an email service, is received from and
 * replied to: `ChannelTransport.receive` makes events of a request the system sent, and
 * `ChannelTransport.post` replies in one of its conversations. What becomes of the events, and
 * which messages are posted, is the application's; the transport knows its system alone.
 *
 * @since 0.1.0
 */

/**
 * The transport contract: external ids, conversations, senders, the events a system sends, what
 * posting takes and gives, and the error a transport fails with.
 *
 * @since 0.1.0
 */
export * as ChannelTransport from "./ChannelTransport.ts";
