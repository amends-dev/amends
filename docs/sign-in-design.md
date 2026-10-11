# Sign-in

How people sign in to a host and who they are once they have. Accounts, sessions, sign-out, and
email codes are implemented, with the local host's development sign-in; production sign-in and
identity providers are designed below and not built. The [first slice](#the-first-slice) records
how the sign-in screens were introduced.

## Accounts

Core names a person by an opaque human ID and nothing else. The host keeps who that is through the
gateway's `Accounts` contract: one account for each email address, its human ID a random UUID the
host issues, never the address. An account is created the first time its address comes up, when
its owner first signs in or a workspace first invites it, so an invitation can name a person who
has never signed in. Addresses are trimmed and lowercased, so one address is one account however it
is typed.

Invitations go to an address over HTTP; the host resolves it to the account and core records the
human ID, so only someone signing in with that address can accept. A workspace's addresses are
shown only to whoever may manage its invitations, through `GET /workspaces/:id/accounts`; members
otherwise see each other by the name each chose in the workspace, which every member has.

## Sessions

Signing in yields a `SignIn.Session`: a token, opaque to clients, and the account it signs in as.
Clients store it for each API URL and send the token as a bearer credential. The host's
`SessionTokens` resolves the token on every request, and `revoke` stops honoring it when its holder
signs out with `DELETE /me/session`; the client forgets it either way. `GET /me` returns the
account a token signs in as, for a client that holds a token alone; a token no account holds
answers 401.

`GET /session/methods` lists the ways a host signs people in: whether it sends email codes, and
the identity providers it offers, each with an ID and a name to show. The email-code flow is
`POST /session/email`, which sends a code to the address, then `POST /session/code`, which
exchanges it for a session.

The local host's development sign-in logs codes instead of sending them, and its tokens are the
human ID itself, which it trusts from any caller and cannot revoke; see
[development authentication](../hosts/local/README.md#development-authentication).

## Production sign-in

Designed, not built. A host implements `SignIn` and `SessionTokens` over an authentication library
kept behind these contracts, so core, the HTTP contract, and the apps do not change with it:

- Codes are emailed through a sender the host configures, single use, short-lived, rate limited by
  address and by client.
- Tokens are random values the host stores hashed, with an expiry it extends on use; revoking
  deletes one. A token says nothing about its holder until the host resolves it.
- The library's tables live beside the host's, applied by the same startup migrator, and its
  secret comes from the deployment's configuration.

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

The desktop app signs in through the system browser, since providers such as Google refuse
embedded webviews: it opens the start address with a return address it listens on, a loopback
port or its own URL scheme, and exchanges the code it receives there.

## Sign-in and connection OAuth

Connections to systems such as Slack or an MCP server also use OAuth, and share sign-in's
machinery: the host's registered OAuth clients, a callback that finds its pending flow by state,
the pending flow's state and verifier, and the protocol client. They differ in who owns the
result. Signing in reads who the person is and discards the provider's tokens; a connection keeps
its grant, sealed with the connection's credentials and refreshed when it expires, and only a
member allowed to manage the connection may start one. MCP servers also need discovery of their
authorization server and dynamic client registration, which registers a client for each server
rather than one from the host's configuration.

## The first slice

Implementation of the [feature development flow](feature-development.md): the first slice
requested an email code, verified it, and established a session, and workspace selection came
next. Web and desktop now render the [UI](../apps/ui/README.md) `SignInEmail` and `SignInCode`
screens, drawn from the Lunacy mocks, and switch between them on the
[client hook](../apps/client/src/sign-in.ts)'s step. The screens take its error codes and pending
actions and own the wording, the delivery hint, and focus. The original slice's UI pieces and the
features `SignIn` parts described below lived in packages that have since been removed; the
sections that follow are historical.

```text
Web/desktop sign-in route
└─ SignInPage (owned by web or desktop, over useSignIn)
   ├─ UI SignInEmail → Field + Input
   └─ UI SignInCode → Field + CodeInput
```

### UI pieces

The original slice reused the previous UI's Input, Field, Button, Text, and layout primitives.
Existing tokens, field errors, and Button pending behavior cover their basic states.

| New piece         | Location in the old UI  | Responsibility                                                                                                                                                                                                                          |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodeInput`       | `primitives/code-input` | One native text input with six visual cells, one value, and one tab stop. Supports paste, selection, leading zeros, numeric input mode, and one-time-code autocomplete. Accepts Field associations; owns no verification or submission. |
| `SignInEmailForm` | `features/sign-in`      | Heading, email field, submit action, and inline request feedback.                                                                                                                                                                       |
| `SignInCodeForm`  | `features/sign-in`      | Heading, delivery guidance, code field, verify action, resend, change email, and inline feedback.                                                                                                                                       |

The `SignInPage` compositions live in `apps/web/src/pages` and
`apps/desktop/src/pages`; UI supplies reusable visual pieces. The app's
`ThemeProvider` wraps `Shell.Root`. Pages use Shell's existing header/main/footer
parts; `Shell.Content` supplies a named narrow column and optional centering.
`Shell.Body scroll="page"` keeps enlarged content and chrome in one scrollable flow.
The custom badge is omitted in favor of reviewed Text. Apps define no styles.

Each form is independently renderable. Values, pending/error state, and action
callbacks come from its caller; forms own native submission, focus, and accessible
feedback. Use explicit submit actions, including Enter. Keep headings and feedback
local to these forms until another consumer needs a shared composition.

CodeInput adapts its six cells to one field at narrow widths so enlarged text
stays readable; the native input and its value remain mounted.

The original composition:

```text
Web/desktop sign-in route
└─ SignInPage (owned by web or desktop)
   └─ SignIn.Root (shared controller context)
      ├─ SignIn.EmailForm → UI SignInEmailForm
      └─ SignIn.CodeForm → UI SignInCodeForm → Field + CodeInput
```

The connected parts render their active forms; nested children declare their
structure without passing complete components through custom props. Client owns drafts, the accepted
email, step transitions, requests, validation, duplicate/stale request protection,
and session replacement. Features map client outcomes into UI props; UI imports
no client or HTTP types. App guards validate the resulting session and navigate
using the existing safe return path.

### Contract and design

The [HTTP contract](../packages/api-http/src/session.ts) already provides
`POST /session/email` → 202 and `POST /session/code` → session or a 403 rejection
(`mismatch`, `expired`, `unknown`). Resend uses the email endpoint again. Sign-in
belongs to the gateway/host; this slice needs no new core operation.

Use the sign-in frames in the [Lunacy mocks](../design-system/) for composition, with the
reviewed UI tokens and control sizing. Real code entry uses the native control. Passkeys, Google sign-in,
and workspace screens are outside this slice. The current host logs codes and
expires them after ten minutes; delivery guidance must describe that behavior.
The reference's device-binding claim is not implemented.

### Review order

Review CodeInput, the email form, and the code form separately in UI Storybook.
Cover keyboard/paste/autofill, invalid and pending states, both themes, long email
addresses, narrow layouts, and enlarged text. Then verify the connected flow:
success, wrong/expired/unknown code, resend invalidation, request failure/retry,
duplicate submission, and changing email or unmounting during a request.

Use the [host test-server pattern](../hosts/local/test/http.test.ts) with captured
codes and temporary PostgreSQL data. Success must also prove the credential works
against the directory. Finally introduce the page layout and verify both app
routes, return paths, builds, and a native desktop smoke check.
