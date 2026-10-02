# Amends client

`@amends/client` is the headless half of web and desktop. It talks to the host, keeps what it
read current, and gives each screen a hook that returns what to show and the actions it offers.
It renders nothing: web and desktop connect these hooks to [UI](../ui/README.md) screens and own
routes, navigation, and page composition. Its hooks return the screens' own types, which it
imports type-only from UI; UI imports nothing from client. The package lives under `apps/*`
because its hooks use Solid and browser storage.

## Layout

```text
src/
  provider.tsx    ClientProvider: the credential, and an API client and atom registry made for it
  sign-in.ts      useSignIn
  api/            shared plumbing: the client, failures, invalidation keys, useMutation,
                  useChanges, refreshResult, the directory read
  session/        the browser session store; DirectoryProvider, useDirectory, useWorkspace
  live/           the change feed: its stream (api.ts), provider, status, and wake detection
  workspaces/  conversations/  agents/  connections/  environments/  settings/  turns/
                  one folder per feature: api.ts holds its reads and operations over the HTTP
                  contract; the other files are the hooks its screens connect to
  appearance/     AppearanceProvider, independent of the session
  routing/        pure path helpers
```

A feature's hooks return plain data and callbacks, typed as the screens' types: names instead of
IDs where screens show names, and failure codes the screens word. Where a page links what a hook
returns, the hook gives the screen's type without its hrefs and with the IDs the page links by. Each hook's doc comment states its contract; the tests in
`test/` exercise them.

## Reads

Reads are atoms over the generated client, `client.query` or `client.runtime.atom`, shared by
every consumer in a credential scope and live while mounted. Each registers an invalidation key
from `api/keys.ts`: the directory, a workspace resource such as `members` or `agents`, or one
group's stream, one thread's timeline, and so on. Writes invalidate the keys they change, and the
[change feed](../../docs/change-feed.md) invalidates the keys each commit affects, so whatever is
mounted refreshes. Paged reads (group streams, timelines, the inbox) keep their pages in one atom
and read on from its previous value, so a refresh never drops what is on screen.

## Writes

`useMutation(operation)` runs an operation, `(api, input) => Effect`, for the mounted owner, one at
a time, and returns `{ pending, run, cancel }`. `run` answers with the operation's `Exit`, or with
`undefined` when it did not start, was cancelled, or its owner unmounted, so an action reads top to
bottom:

```ts
const request = useMutation(renameSelf(workspaceId));
async function save() {
  setError(undefined);
  const exit = await request.run(name());
  if (exit === undefined) return;
  if (Exit.isSuccess(exit)) saved();
  else setError(workspaceFailure(exit.cause));
}
```

A hook exposes such an action as `save: () => void save()`. Unmounting interrupts the running
operation; the server may still complete it.

`useChanges({ write, reload, failed, done, outdated })` runs the changes of a page whose changes
count as done only once their result shows: agents, connections, environments, and settings. It
runs one change at a time, then `reload`s what the page shows. A failure stays with the change it
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
It reads the stored credential and makes an API client for it, which sends its token, and an atom
registry. Signing in or out remounts everything under the provider with a new client and
registry, which interrupts the old credential's requests and discards what it read. That remount
is the only guard: no hook checks the session. `useSession()` gives the credential, `signIn`,
`signOut`, and `signedOut`, which holds once the credential was cleared by signing out, here or in
another window, rather than rejected, so the apps send the next person to sign-in afresh.

A request the host answers with `401` signs the credential out in the API client, so operations
never handle it. The sign-out clears storage only while storage still holds the rejected
credential; a newer one another window stored is adopted instead. Signing out does not revoke the
token on the server; the local host uses
[development authentication](../../hosts/local/README.md#development-authentication).

`createBrowserSessionStore(apiBaseUrl)` keeps the credential in local storage keyed by API URL,
discards malformed records, follows other windows' changes, and falls back to memory when storage
is blocked. `DirectoryProvider` validates the credential through `GET /me/workspaces`, keeps the
last listing through refreshes, and refreshes when the page wakes, since invitations from other
workspaces reach no change feed. `returnPath` limits where sign-in returns to internal workspace
destinations.

## Boundaries

Only the modules in `api/` and each feature's `api.ts` import the HTTP contract and gateway
schemas. Client imports UI's types only, as a development dependency, and no UI code, icons,
styling, router, Storybook, platform entry points, or backend implementations; UI imports no
client code. `bun run check:packages` enforces both across source and manifests.

Feature API modules also expose the existing schema helpers their views use to branch
on decoded values. The client exports `DirectoryState`, `SignInState`, and
`CreateWorkspaceState` as constructor bundles alongside their types, so app pages
can use their `$is` guards without comparing `_tag` directly.

## Verification

```sh
bun run --filter @amends/client typecheck
bun run --filter @amends/client test
bun run check
```

Tests mount hooks inside `ClientProvider` over fake fetch transports, with no UI or router. They
cover sign-in, session storage and replacement, rejected credentials, the directory, the change
feed over a fake event stream, and each feature's reads, writes, failures, and cancellation.
