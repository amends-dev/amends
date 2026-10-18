# Sign-in

How people sign in to a host and who they are once they have. Accounts, sessions, sign-out, and
email sign-in are implemented; identity providers are designed below and not built, and no email
provider is configured yet, so the local host logs the emails it sends. The
[first slice](#the-first-slice) records how the sign-in screens were introduced.

## Accounts

Core names a person by an opaque human ID and nothing else. The host keeps who that is through the
gateway's `Accounts` contract: one account for each email address, its human ID a random UUID the
host issues, never the address. An account is created the first time its address comes up, when
its owner first signs in or a workspace first invites it, so an invitation can name a person who
has never signed in. Addresses are trimmed and lowercased, so one address is one account however it
is typed.

Invitations go to an address over HTTP; the host resolves it to the account and core records the
human ID, so only someone signing in with that address can accept. A workspace's addresses are
shown only to whoever may manage its invitations, through `GET /accounts`; members
otherwise see each other by the name each chose in the workspace, which every member has.

## Sessions

Signing in yields a `SignIn.Session`: a token, opaque to clients, and the account it signs in as.
Clients store it for each API URL and send the token as a bearer credential. The host's
`SessionTokens` resolves the token on every request, and `revoke` stops honoring it when its holder
signs out with `DELETE /me/session`; the client forgets it either way. `GET /me` returns the
account a token signs in as, for a client that holds a token alone; a token no account holds
answers 401.

A browser that keeps a workspace in [sync](../packages/sync/README.md) makes an eventlog identity of
its own and registers its key with `PUT /me/sync-keys/:publicKey`, signed in; the key, not the
token, then opens the person's stores. A key outlives the session it was registered in until it is
removed with `DELETE /me/sync-keys/:publicKey`, which the browser does as it signs out: revoking a
token, by signing out elsewhere or by its expiry, leaves the keys registered under it.

`GET /session/methods` lists the ways a host signs people in: whether it sends email codes, and
the identity providers it offers, each with an ID and a name to show. The email-code flow is
`POST /session/email`, which sends a code to the address, then `POST /session/code`, which
exchanges it for a session.

`POST /session/email` answers 429 with `SignIn.Limited` when too many codes were asked for lately,
and 503 with `SignIn.Unavailable` when the host could not send one.

## Email sign-in

The gateway's [`EmailSignIn`](../packages/gateway/src/EmailSignIn.ts) implements `SignIn` and
`SessionTokens` over three host contracts: `SignInStorage`, which each storage adapter implements;
`Accounts`; and `EmailSender`, the host's email provider.

- A code is six random digits, sent to the address and stored only as an HMAC-SHA256 digest under
  the host's code key. It works once, within ten minutes, and stops working after five wrong
  tries. A new code replaces the last.
- An address is sent a code at most every thirty seconds and five in an hour, across every host
  over the storage. A client, by the network address its requests come from, may ask for twenty in
  an hour, counted within one process. A code the provider did not send leaves the address as it
  was, so asking again works at once.
- Completing sign-in finds or creates the address's account and begins a session: a token of 32
  random bytes, stored only as its SHA-256 digest. A session ends after thirty days unused and
  ninety at most; using it moves its end at most once a day. Revoking deletes it.

The policy's numbers are `EmailSignIn.defaultPolicy`, which a host may change. The storage suites
run `EmailSignIn` over each adapter, so both stores keep these limits.

The local host signs in by email unless `AMENDS_SIGN_IN=development`. Its code key derives from
`AMENDS_CREDENTIAL_KEY`, so a code one process sent works on another; its emails go to its log until
an email provider is chosen. Development sign-in remains for tests and scripts: it logs codes, and
its tokens are human IDs, which it trusts from any caller and cannot revoke; see
[development authentication](../hosts/local/README.md#development-authentication).

## Identity providers

Designed, not built. Each provider the host is configured with, such as Google, appears in
`GET /session/methods`. Signing in with one is an authorization-code flow with PKCE:

1. The client opens `GET /session/providers/:providerId/start` with where to return to. The host
   records the pending sign-in, its state, verifier, and return address, and redirects to the
   provider.
2. The provider returns to `GET /session/providers/:providerId/callback`. The host checks the
   state, exchanges the code, and reads the address the provider verified. An unverified address
   signs in to nothing. The host finds or creates that address's account, discards the provider's
   tokens, and redirects to the return address with a one-time code.
3. The client exchanges the code with `POST /session/exchange` for a `SignIn.Session`.

A provider signs in to the account of the address it verified, so email codes and every provider
reach the same account for one address.

## Sign-in and connection OAuth

Connections to systems such as Slack or an MCP server also use OAuth, and share sign-in's
machinery: the host's registered OAuth clients, a callback that finds its pending flow by state,
the pending flow's state and verifier, and the protocol client. They differ in who owns the
result. Signing in reads who the person is and discards the provider's tokens; a connection keeps
its grant, sealed with the connection's credentials and refreshed when it expires, and only a
member allowed to manage the connection may start one. MCP servers also need discovery of their
authorization server and dynamic client registration, which registers a client for each server
rather than one from the host's configuration.
