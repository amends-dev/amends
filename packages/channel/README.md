# @amends-dev/channel

Channels bring external conversations in. A **channel transport** is how one external system,
such as Slack, an email service, or a chat bridge, is received from and replied to: it verifies and
reads what the system sends, as events in the system's conversations, and posts replies there. What
becomes of the events, which messages are posted, and who sees what are the application's
concerns; the transport knows its system alone. The package depends only on Effect.

## Install

```sh
bun add @amends-dev/channel effect
```

Add a transport for each system you connect, written as [an adapter](#writing-a-transport). In
amends, [`@amends-dev/connection`](../connection) installs a transport as what an integration gives
its connections, and [core's channels](../core/README.md#channels) take its events in as threads.

## The contract

`ChannelTransport.ChannelTransport` has four members and two optional ones:

| Member    | What it does                                                                                                                                                                                                                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `self`    | The transport's own identity in the system, such as its bot user, or undefined when it has none. What it posted and receives back is known as an echo by it, and by the ids `post` gave.                                                                                                                 |
| `receive` | Takes an `Inbound` request the system sent the host, its `headers` and `body` as they came, verifies it as the system signs it, and gives `Received`: the `events` in it, none for a request that carries no message, and the `answer` the system expects when it does, as a URL verification challenge. |
| `post`    | Sends `Outgoing`, a `text` and its `author`'s name, as a reply in a `Conversation`, and gives `Posted`, the `messageId` the system assigned.                                                                                                                                                             |
| `edit`    | Optional: replaces a posted message's text, where the system allows it.                                                                                                                                                                                                                                  |
| `delete`  | Optional: removes a posted message, where the system allows it.                                                                                                                                                                                                                                          |

An `Event` is one of `MessageReceived`, `MessageEdited`, or `MessageDeleted`. Each names the
`conversation`, the `messageId`, the `sender`, and when it happened; a received or edited message
carries its `text`, and a received one may carry a `title` for a conversation that has one, such as
an email's subject. A `Conversation` is the system's `id` for it, which must be stable, since it
keys everything that comes of the conversation, and `details`, whatever the transport needs to post
there later, kept as JSON and given back to `post` as it was: a Slack channel and thread timestamp,
an email's message id to reply to. A `Sender` is the person's `id` in the system and what they are
called. Every id is an `ExternalId`, a non-empty string the system owns.

Every operation fails with `TransportError`, whose `reason` says what to do: `rejected`, the
request is not the system's or cannot be read, and the system should be answered so; `refused`, the
system refused the operation for good, such as a message in an archived conversation; and
`unavailable`, the system could not be reached now, which `isRetryable` says, so the caller may try
again. `cause` carries what the system said.

## Writing a transport

A transport is a plain object, usually made once per connection to the system with the
connection's settings and secret. Slack, for example:

```ts
import { ChannelTransport } from "@amends-dev/channel"
import { Effect, Schema } from "effect"

export const slack = (options: {
  readonly botToken: string
  readonly signingSecret: string
  readonly botUserId: string
}): ChannelTransport.ChannelTransport => ({
  self: ChannelTransport.ExternalId.make(options.botUserId),
  receive: (inbound) =>
    Effect.gen(function* () {
      yield* verifySignature(inbound, options.signingSecret) // TransportError "rejected"
      const payload = yield* decodeEventsApi(inbound.body)
      if (payload.type === "url_verification") return { events: [], answer: payload.challenge }
      return { events: yield* eventsOf(payload) }
    }),
  post: (conversation, outgoing) =>
    chatPostMessage(options.botToken, {
      channel: conversation.details.channel,
      thread_ts: conversation.details.thread_ts,
      text: `${outgoing.author}: ${outgoing.text}`
    }).pipe(Effect.map((posted) => ({ messageId: posted.ts })))
})
```

A `MessageReceived` event's conversation is the Slack channel and thread it arrived in, with the
message's `ts` as its id, and the sender resolved from the user id by one lookup. Edits and
deletions arrive as `message_changed` and `message_deleted` subtypes, and become `MessageEdited`
and `MessageDeleted`. A system that only pushes to a public URL, such as Slack or Google's
notifications for Gmail, is served by a host that exposes its events route; a system with no API,
such as iMessage, is served by a bridge that posts to that route and that `post` calls in turn.

Keep the transport stateless where you can: it is made for each request. Reading the same message
twice is safe, since what consumes the events derives every id from the system's and treats a
repeat as nothing new.

## Development

The package is a contract and has no tests of its own: `@amends-dev/connection` checks what it does
with a transport, and the gateway's tests run channels on a test transport. See
[testing](../../docs/testing.md). `bun run dist check packages/channel` builds the package as npm
gets it and checks it as a consumer; see [publishing](../../docs/publishing.md).
