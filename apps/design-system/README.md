# Amends design system

Reusable Solid feature components and their Storybook workshop. Production components live in
`src/`; stories import that source, and web consumes the same package exports. The workshop
runs independently of the web app, sessions, and backend.

## Run and verify

From the repository root:

```sh
bun install
bun run --filter @amends/design-system dev
bun run --filter @amends/design-system test
bun run --filter @amends/design-system build
bun run check
```

Development serves Storybook at `http://127.0.0.1:6006`. The build produces a static workshop
in `apps/design-system/dist`. Package consumers import TypeScript source, not that site.
The root `bun run test` includes this workspace's component and portable-story suites.

The workshop uses `storybook-solidjs-vite` 10.7.2 with Storybook 10.6.0. Its Vite builder reuses
this package's `vite.config.ts`, including Solid and vanilla-extract; do not register those
plugins again in `.storybook/main.ts`. Cotton and Soot are available in the toolbar, using
the existing UI styles, fonts, and tokens. The Narrow story provides a constrained container;
the viewport toolbar additionally tests actual viewport behavior.

## Ownership

| Package                 | Owns                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@amends/ui`            | Visual foundations, general controls, accessibility behavior, and layout primitives.                          |
| `@amends/design-system` | Reusable product interactions, local drafts, validation feedback, and feature presentation.                   |
| `@amends/web`           | Sessions, workspace identity, API queries/commands, domain-error explanations, routing, and page composition. |

`src` depends on Solid and `@amends/ui`. It does not import backend services, HTTP contracts,
the web app, or Storybook. Use small presentation contracts and callbacks; the integration maps
the actual backend result into those contracts. Permission decisions stay authoritative in core.
The component receives available choices instead of inferring authority from role names.
`bun run check:packages` enforces these source boundaries, including type-only imports.

Keep Storybook dependencies, fixtures, and browser setup outside package exports. A story must
exercise the production component rather than copy its JSX. Add a new domain subpath when it
has a component to export; avoid a growing barrel that imports every feature into consumers.

## First feature: issuing an invitation

```tsx
import { IssueInvitationForm } from "@amends/design-system/invitations";

<IssueInvitationForm
  roles={{
    _tag: "Ready",
    choices: [{ id: "viewer", label: "Viewer", assignable: true }],
  }}
  defaultRoleId="viewer"
  onRetryRoles={refreshRoles}
  onSubmit={issueInvitation}
/>;
```

`refreshRoles` refreshes the caller's query. `issueInvitation` receives an `InvitationDraft`
with `recipientId`, `roleId`, and `expiresInDays` (7 or 30), and returns a Promise of
`IssueInvitationResult`: `Issued` with a recipient and formatted expiry date, `Failed` with
a safe explanation, or `Cancelled` when the integration suppresses a completion. The web
wrapper supplies branded IDs, computes the absolute expiry, calls the existing HTTP command,
and keeps its existing cache invalidation and session behavior.

`InvitationRoles` distinguishes `Loading`, `Unavailable`, and `Ready`. Ready data may be
refreshing or carry a refresh error while keeping its current choices. Unavailable state hides
the form; callers must use it when previously readable choices lose authorization. Empty or
unassignable choices prevent submission. An existing role selection is not silently replaced
when its availability changes.

The form owns its draft and pending state. It presents native email validity as associated
inline feedback, prevents duplicate submissions, locks editing while pending, and clears the
address only after success. Failure retains the draft for retry. Rejected callbacks receive a
generic safe error. Disposed instances ignore late completions. `initialDraft` and
`defaultRoleId` seed a new instance; they do not overwrite later edits. Containers must remount
the interaction when its workspace or other owning identity changes, as the web wrapper does.

## Stories and tests

Invitation stories cover empty/filled drafts, loading, unavailable and unassignable roles,
refreshing and failed refresh, invalid input, pending submission, success, failure, retry,
changing role availability, a narrow container, and Soot. Foundation stories exercise existing
buttons, notices, and the composer. This is a first feature and representative foundation set,
not a catalog of every existing UI component.

Vitest suites declare tests with `@effect/vitest` and use Solid Testing Library. Story `play`
functions use `storybook/test` for instrumented browser actions and assertions. Portable tests
wrap those same story definitions with `definePreview` from `storybook-solidjs-vite/next` and
execute `.run()` under the repository's Bun/Vitest 5 runner. The `/next` export includes the
preview factory in Node-based tests; the main export's Node condition exposes configuration only.

The Storybook Vitest addon is not installed: version 10.6.0 declares Vitest 3/4 compatibility,
while this repository uses Vitest 5. Recheck compatibility before changing that arrangement.
The accessibility addon is available in the browser. Portable interaction tests do not replace
browser layout, accessibility, or visual review; there is no automated screenshot-baseline suite.

All three Solid test projects use the explicit DOM-matcher setup in
[`scripts/testing/jest-dom.ts`](../../scripts/testing/jest-dom.ts). This prevents optional
dependency discovery by the Solid Vite plugin from changing tests when Storybook is installed.
The root override pins `vite-node` 5.0.0 for vanilla-extract's evaluator, keeping it on Vite 7;
version 6 pulls Vite 8 and failed the Bun production build. Verify both builds before removing it.

For each new feature, add representative state stories, test important transitions and cleanup,
and keep a real web integration using the same exported component. Backend tests verify policy
and transactions; component tests verify interaction behavior; web and browser checks verify
the connection between them.
