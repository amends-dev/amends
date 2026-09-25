# Sign-in controller

`useSignIn()` is exported from `@amends/client`. Mount it inside ClientProvider;
each call owns an independent email/code flow in the current credential scope.
It renders nothing and has no UI, router, or platform dependency.

## State and actions

`state()` is a tagged union:

| State            | Data                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `Email`          | Email draft, pending flag, and `invalid-email` or `request-failed` error.                     |
| `Code`           | Accepted email, code draft, `verifying`/`resending` pending action, error, and `resent` flag. |
| `SessionPresent` | A credential already exists; the app's directory guard still validates it.                    |

Absent errors and pending code actions are `undefined`. Code errors are
`invalid-code`, the server's `mismatch`/`expired`/`unknown` rejection, or
`verify-failed`/`resend-failed`. These are state values; the connected feature owns
their presentation text.

- `setEmail` and `setCode` update the appropriate idle step and clear its feedback.
- `requestCode(email?)` validates and requests a code, then enters the code step
  only after success. Omit the argument to use the current draft.
- `verifyCode(code?)` validates and verifies the code for the accepted email.
  Success installs the decoded session through the existing session scope.
- `resendCode()` uses the accepted email without validating the code draft.
  Failure retains that draft; success clears it and sets `resent` for a notice.
- `changeEmail()` cancels the active operation and returns to the email step,
  retaining the address and discarding code-step state. It works while pending.

Other actions, including draft setters, are ignored while a request is pending.
Actions for the wrong step, an obsolete/disposed owner, or a credential-bearing
scope are also ignored. There are no automatic requests or retries. Failed requests
retain the relevant draft so callers can retry explicitly.

## Boundaries and lifetime

The [API module](../api/sign-in.ts) reuses the gateway's email/code schemas and the
generated HTTP client. Values are not trimmed, case-folded, or converted to numbers;
leading zeros survive. Session responses are schema-decoded before installation.
Malformed responses become request failures rather than credentials.

Each controller has a private request atom over the existing API runtime. Returning
to email resets that atom, interrupting its request. Unmounting releases it with
zero idle TTL; credential replacement disposes the entire registry. Attempt identities
and owner/session checks prevent stale results from changing a newer flow or session.
Cancellation protects client state; it does not undo work already done by the server.

Tests use the real generated client with isolated fetch transports, including a
transport that deliberately resolves after abort. They cover payloads, state transitions,
failures, cancellation, concurrent controllers, and session replacement. Connected
UI and live backend scenarios remain the next slice.
