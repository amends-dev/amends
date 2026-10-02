# Sign-in slice

Implementation of the [feature development flow](feature-development.md).
The first slice requests an email code, verifies it, and establishes a session.
Workspace selection is the next feature.

**Current composition.** This page records the original slice. Web and desktop now render
the [UI](../apps/ui/README.md) `SignInEmail` and `SignInCode` screens, drawn from the Lunacy
mocks, and switch between them on the [client hook](../apps/client/src/sign-in.ts)'s
step. The screens take its error codes and pending actions and own the wording, the delivery
hint, and focus. The original slice's UI pieces and the features `SignIn` parts described below
lived in packages that have since been removed; the sections that follow are historical.

```text
Web/desktop sign-in route
└─ SignInPage (owned by web or desktop, over useSignIn)
   ├─ UI SignInEmail → Field + Input
   └─ UI SignInCode → Field + CodeInput
```

## UI pieces

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

## Contract and design

The [HTTP contract](../packages/api-http/src/session.ts) already provides
`POST /session/email` → 202 and `POST /session/code` → session or a 403 rejection
(`mismatch`, `expired`, `unknown`). Resend uses the email endpoint again. Sign-in
belongs to the gateway/host; this slice needs no new core operation.

Use the [sign-in reference](<../design-system/Amends Screen · Sign in.dc.html>) for
composition, with the reviewed UI tokens and control sizing. Its keypad is demo
scaffolding; real code entry uses the native control. Passkeys, Google sign-in,
and workspace screens are outside this slice. The current host logs codes and
expires them after ten minutes; delivery guidance must describe that behavior.
The reference's device-binding claim is not implemented.

## Review order

Review CodeInput, the email form, and the code form separately in UI Storybook.
Cover keyboard/paste/autofill, invalid and pending states, both themes, long email
addresses, narrow layouts, and enlarged text. Then verify the connected flow:
success, wrong/expired/unknown code, resend invalidation, request failure/retry,
duplicate submission, and changing email or unmounting during a request.

Use the [host test-server pattern](../hosts/local/test/http.test.ts) with captured
codes and temporary PostgreSQL data. Success must also prove the credential works
against the directory. Finally introduce the page layout and verify both app
routes, return paths, builds, and a native desktop smoke check.
