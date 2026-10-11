# @amends-dev/server-http

The HTTP server for the [HTTP contract](../api-http/README.md): one handler module per endpoint
group, built with Effect's `HttpApiBuilder`, and the bearer authentication the contract declares. A
host mounts its routes over the [gateway](../gateway/README.md), and the
[local host](../../hosts/local/README.md) does so on Bun. It is internal to this repository and not
published to npm.

Each workspace handler decodes the request, reads the `Principal` the authentication middleware
provided, enters the workspace through `Gateway.asMember`, or `Gateway.inWorkspace` where no member
acts, and calls one core service. Encoding, status codes, and error decoding come from the contract.
Credential verification belongs to the middleware and domain rules to core; handlers only pass
principals, paths, bodies, and `Idempotency-Key` headers into core's inputs, and refuse agents at
the endpoints only a person may call.

## Use

A host supplies `Gateway.Service`, `Accounts.Service`, `SignIn.Service`, `SessionTokens.Service`,
`WorkspaceDirectory.Service`, and its platform's HTTP services, then mounts the routes with
`HttpRouter.serve` or `HttpRouter.toWebHandler`:

- `Routes.layer` registers every group, with the OpenAPI document at `/openapi.json`.
- `Routes.layerDocs` serves interactive documentation at `/docs`.
- `Routes.layerHandlers` is the group layers and authentication alone, for tests.
- `BearerAuthentication.make()` builds the contract's `Authentication` from `SessionTokens.Service`,
  and `BearerAuthentication.layer` provides it. Each request resolves its own bearer token and
  supplies its own `Principal` and `Credential`.

## Handlers

The session and `me` handlers call the host's `SignIn`, `Accounts`, `WorkspaceDirectory`, and
`SessionTokens` directly; signing out revokes the request's `Credential`. Issuing an invitation finds
or creates the account of the address it names before calling `InvitationService`, and the
workspace accounts handler lists invitations, which authorizes the read, then reads the accounts of
the members and recipients. Every other group enters a workspace and calls the core service it is named for: notifications call
`NotificationService`, groups and threads call `GroupService`, `GroupMembershipService`,
`GroupFollowService`, `ThreadService`, `ThreadMessageService`, `ThreadParticipationService`, and
`ReadStateService`, and so on for tasks, connections, agents, turns, and channels. A handler merges
the path's IDs, the body, and any cursor into the operation's input; core authorizes, validates, and
chooses who takes part.

The channel events route has no principal. It enters through `Gateway.inWorkspace` and hands the
request's headers and body, as text, to `ChannelIntake.receive`, answering with the text the
channel's transport says to give.

## Streams

`ChangeFeedHandlers.watch` serves `ChangeFeedService.watch`, and `TurnsHandlers.watchLog` serves
`TurnService.watchLog`, both as server-sent events. Effect's HTTP server moves the request's scope
to the response stream, so the workspace and the subscription stay open until the stream completes
or the client disconnects. HTTP owns the SSE encoding, cache headers, and comment heartbeats every
five seconds; core owns the messages and who may see each one. The handlers send no frontend query
keys.

Both streams share `Streams`, which also contains unexpected failures: Effect's SSE encoder would
send a stream's whole failure cause to the client, so the handler logs it and ends the change feed
with `ChangeFeed.Unavailable`, or a turn log with `Turn.LogUnavailable`, alone.

Each process serves a limited number of streams at once, change feeds and turn logs together.
`Streams.Limits`, a context reference, allows a thousand per workspace and twenty per member of it
by default, and a host provides its own to change them. A stream holds its place from before the
gateway admits it until its response ends, and a stream beyond either limit fails with
`Api.TooManyStreams` (429), naming the limit it met.

`Draining.Service` is the server beginning to shut down. Where a host provides it, open streams end
with their `Unavailable` error as it completes, so their clients reconnect, to another process if
one runs, and the HTTP server's graceful stop waits only for ordinary requests. `Draining.layer`
creates it, and a host builds `Draining.layerOnRelease` after its HTTP server so that releasing it,
first, begins the drain.

## Conventions

Keep one handler module per contract group, with the contract's filename: `src/invitations.ts` here
implements `api-http/src/invitations.ts`. `MembersHandlers` and the like name endpoint collections
and `Routes` composes them. Each handler module exports `layer`, built with `HttpApiBuilder.group`,
which checks that every declared endpoint is implemented; no constructor or service tag wraps it.
`Principal` is the authenticated human or agent; core's `Actor.Service` is the member the gateway
resolves for an operation. Handlers use the gateway's decoded field names, such as `humanId` and
`activeMemberCount`, and the contract's codecs encode them.

## Development

```sh
bun run test packages/server-http
```

The tests run the handlers through `HttpApiTest` against a gateway stub that records how each
request entered and runs programs over stubbed core services. They cover principals and parameters
reaching core, tags and statuses kept, unauthorized requests refused before any gateway call,
human-only endpoints, JSON round trips, stream limits and containment, and that every error a route
declares is public in the gateway or raised by HTTP itself. The
[local host](../../hosts/local/README.md)'s tests run the same routes over PostgreSQL, through its
spawned server too. See [testing](../../docs/testing.md).
