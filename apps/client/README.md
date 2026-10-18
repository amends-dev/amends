# @amends-dev/client

The headless half of the [web](../web/README.md) and [desktop](../desktop/README.md) apps. It talks
to the host, keeps what it read current, and gives each screen a hook that returns what to show and
the actions it offers. It renders nothing: web and desktop connect these hooks to
[UI](../ui/README.md) screens and own routes, navigation, and page composition. Its hooks return
the screens' own types, which it imports type-only from UI; UI imports nothing from client.

The package is internal to this repository and not published to npm. It lives under `apps/`
because its hooks use Solid and browser storage.

## Layout

```text
src/
  provider.tsx    ClientProvider: the credential, and the API clients and atom registry made for it
  configuration.ts  resolveApiBaseUrl: the API URL an app resolves once at startup
  sign-in.ts      useSignIn
  api/            shared plumbing: the clients, failures, how live streams back off, invalidation
                  keys, useMutation, useWorkspaceMutation, useChanges, refreshResult, the directory read
  session/        the browser session store; DirectoryProvider, useDirectory, useWorkspace
  live/           the change feed: its stream (api.ts), provider, status, and wake detection
  workspaces/  conversations/  agents/  connections/  settings/  turns/
                  one folder per feature: api.ts holds its reads and operations over the HTTP
                  contract; the other files are the hooks its screens connect to
  appearance/     AppearanceProvider, independent of the session
  routing/        pure path helpers
```

A feature's hooks return plain data and callbacks, typed as the screens' types: names instead of
IDs where screens show names, and failure codes the screens word. Where a page links what a hook
returns, the hook gives the screen's type without its hrefs and with the IDs the page links by.
Each hook's doc comment states its contract; the tests in `test/` exercise them.

## Clients

A credential gets one generated client for the session and one for each workspace it acts in,
each with its own runtime and reads. Every endpoint a workspace member calls names its workspace in
the `Amends-Workspace` header rather than its path, so a workspace's client sets that header on
each request, and the session's client, which signs in, reads the directory, and creates or joins
workspaces, sets none and dies if asked to call a member's endpoint. `useApiClient()` gives the
session's client and `useWorkspaceClient(workspaceId)` a workspace's, made when first used and
kept while the credential is. A workspace's operations take `WorkspaceApi`, every endpoint; the
session's take `Api`, only the `session`, `me`, and `workspaces` groups, so an operation that calls
a member's endpoint through the session's client fails to compile.

## Reads

Reads are atoms over a generated client, `client.query` or `client.runtime.atom`, shared by every
consumer of that client and live while mounted; a workspace's reads go through its client. Each registers an invalidation key
from `api/keys.ts`: the directory, a workspace resource such as `members` or `agents`, or one
group's stream, one thread's timeline, and so on. Writes invalidate the keys they change, except
that a post waits for the commit that delivers its message (`awaitMessage`), and the
[change feed](../../docs/change-feed.md) invalidates the keys of the reads each commit made stale, so whatever is
mounted refreshes, or delivers what the commit changed, which shows in place: a timeline shows each
delivered item in place of the one it read, and those that follow it after (`withDeliveredItems`),
a stream each delivered preview in place of the thread it shows, threads that started since
after the newest, and the positions `ThreadRead` signals carry (`withDeliveredPreviews`), and the
groups list each group's delivered latest activity and the read times `GroupRead` signals carry
(`withDeliveredGroupActivity`), and the inbox the notifications delivered after its page was read,
the timeline items delivered at their sources, and what `ThreadRead` and `NotificationsSeen`
signals settled (`withDeliveredNotifications`), and the active turns and a turn the turns
delivered after they were read (`withDeliveredTurns`, `turnWith`).
Paged reads (group streams, timelines, the inbox) keep their pages in one atom and read on from its
previous value, so a refresh never drops what is on screen; a timeline's refresh reads every item it
shows again.

## Writes

`useWorkspaceMutation(workspaceId, operation)` runs an operation, `(api, input) => Effect`, through
the workspace's client for the mounted owner, one at a time, and returns `{ pending, run, cancel }`;
`useMutation(operation)` runs one through the session's. `run` answers with the operation's `Exit`, or with
`undefined` when it did not start, was cancelled, or its owner unmounted, so an action reads top to
bottom:

```ts
const request = useWorkspaceMutation(workspaceId, renameSelf(workspaceId))
async function save() {
  setError(undefined)
  const exit = await request.run(name())
  if (exit === undefined) return
  if (Exit.isSuccess(exit)) saved()
  else setError(workspaceFailure(exit.cause))
}
```

A hook exposes such an action as `save: () => void save()`. Unmounting interrupts the running
operation; the server may still complete it.

`useChanges({ workspaceId, write, reload, failed, done, outdated })` runs the changes of a page in a
workspace whose changes count as done only once their result shows: agents, connections, and
settings. It runs one change at a time through the workspace's client, then `reload`s what the page shows. A failure stays with the change it
belongs to. A stale one (`changed`, `denied`, or `gone`) makes changes wait for `refresh()`, as
does a change whose result could not be read back (`refresh-failed`); the refresh that shows it
completes it. `revision` counts refreshes, so rename drafts rebase on the name now shown.

`refreshResult(atom)` refreshes a read from inside an operation and waits for the result that
refresh produces. `workspaceFailure(cause)` classifies a failure as `changed`, `denied`, `gone`,
`invalid`, or `failed`, from a map keyed by every failure the contract reports, so a new one fails
to compile until it is placed. A schema derived from those keys checks that the error's tag is a
recognized string; it does not validate the rest of the error payload. The first recognized
failure in a cause wins, including one mapped to `failed`. Unrecognized failures, defects, and
interruptions are skipped; without a recognized failure, the result is `failed`.
Readers' inputs decode through `command(schema)`, which reports a mismatch as `invalid` before
any request.

## Session

`ClientProvider` takes an absolute `apiBaseUrl`, a `SessionStore`, and an optional HTTP transport.
It reads the stored credential and makes the API clients for it, which send its token, and an atom
registry. Signing in or out remounts everything under the provider with new clients and a new
registry, which interrupts the old credential's requests and discards what it read. That remount
is the only guard: no hook checks the session. `useSession()` gives the credential, a token and
the account it signs in as, with the address the apps show and suggest names from; `signIn`,
`signOut`, and `signedOut`, which holds once the credential was cleared by signing out, here or in
another window, rather than rejected, so the apps send the next person to sign-in afresh.

A request the host answers with `401` signs the credential out in the API clients, so operations
never handle it. The sign-out clears storage only while storage still holds the rejected
credential; a newer one another window stored is adopted instead. Signing out clears the credential
at once and asks the host to revoke the token with `DELETE /me/session`, apart from the replaced
client; the local host's [development tokens](../../hosts/local/README.md#development-authentication)
cannot be revoked.

`createBrowserSessionStore(apiBaseUrl)` keeps the credential in local storage keyed by API URL,
discards malformed records, follows other windows' changes, and falls back to memory when storage
is blocked. `DirectoryProvider` validates the credential through `GET /me/workspaces`, keeps the
last listing through refreshes, and refreshes when the page wakes, since invitations from other
workspaces reach no change feed. `returnPath` limits where sign-in returns to internal workspace
destinations.

## Boundaries

Only the modules in `api/` and each feature's `api.ts` import the HTTP contract, by its modules such
as `@amends-dev/http/Api` and never its handlers, and the schemas it carries from core's features
and the gateway. Client imports UI's types only, as a development dependency, and no UI code, icons,
styling, router, Storybook, platform entry points, or backend implementations; UI imports no client
code. `bun run check:packages` enforces both across source and manifests.

Feature API modules also expose the existing schema helpers their views use to branch
on decoded values. The client exports `DirectoryState`, `SignInState`, and
`CreateWorkspaceState` as constructor bundles alongside their types, so app pages
can use their `$is` guards without comparing `_tag` directly.

## Development

```sh
bun run --filter @amends-dev/client typecheck
bun run --filter @amends-dev/client test
```

Tests mount hooks inside `ClientProvider` over fake fetch transports, with no UI or router. They
cover sign-in, session storage and replacement, rejected credentials, the directory, the change
feed over a fake event stream, and each feature's reads, writes, failures, and cancellation.
`bun run check` at the repository root also enforces the package's boundaries. See
[testing](../../docs/testing.md).
