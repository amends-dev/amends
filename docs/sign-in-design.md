# Sign-in slice

Planned implementation of the [feature development flow](feature-development.md).
The first slice requests an email code, verifies it, and establishes a session.
Workspace selection is the next feature.

[CodeInput](../apps/ui/src/primitives/code-input/README.md) and both
[sign-in forms](../apps/ui/src/features/sign-in/README.md) are implemented in the UI
workshop. The [client controller](../apps/client/src/sign-in/README.md) implements
the headless flow; the connected feature and page remain planned.

## UI pieces

Reuse [Input](../apps/ui/src/primitives/input/README.md),
[Field](../apps/ui/src/compositions/field/README.md),
[Button](../apps/ui/src/primitives/button/README.md), Text, and layout primitives.
Existing tokens, field errors, and Button pending behavior cover their basic states.

| New piece         | Location in `apps/ui/src` | Responsibility                                                                                                                                                                                                                          |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CodeInput`       | `primitives/code-input`   | One native text input with six visual cells, one value, and one tab stop. Supports paste, selection, leading zeros, numeric input mode, and one-time-code autocomplete. Accepts Field associations; owns no verification or submission. |
| `SignInEmailForm` | `features/sign-in`        | Heading, email field, submit action, and inline request feedback.                                                                                                                                                                       |
| `SignInCodeForm`  | `features/sign-in`        | Heading, delivery guidance, code field, verify action, resend, change email, and inline feedback.                                                                                                                                       |
| `SignInPage`      | `pages/sign-in`           | Brand/header, responsive content column, and optional footer around caller-supplied children. Owns no form or flow state.                                                                                                               |

Each form is independently renderable. Values, pending/error state, and action
callbacks come from its caller; forms own native submission, focus, and accessible
feedback. Use explicit submit actions, including Enter. Keep headings and feedback
local to these forms until another consumer needs a shared composition.

CodeInput adapts its six cells to one field at narrow widths so enlarged text
stays readable; the native input and its value remain mounted.

```text
Web/desktop sign-in route
└─ SignInPage (UI layout)
   └─ SignIn (connected feature)
      ├─ SignInEmailForm
      └─ SignInCodeForm → Field + CodeInput
```

The connected feature renders the active form. Client owns drafts, the accepted
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
