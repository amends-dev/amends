# Sign-in presentation

`SignInEmailForm` is the email step, exported from `@amends/ui/features/sign-in`.
It composes Field, Input, Button, Text, and Column. It owns no client, HTTP,
session, navigation, or theme state. The code form remains a separate planned piece.

```tsx
<SignInEmailForm
  email={email()}
  onEmailChange={setEmail}
  onSubmit={requestCode}
  pending={pending()}
  emailError={emailError()}
  requestError={requestError()}
/>
```

## Contract

The caller owns the email draft, request lifetime, external errors, and next step.
`onEmailChange` receives the edited string; `onSubmit` receives the native field's
current value. The component performs no trimming or case conversion of its own.

Native required/email validation produces inline Field feedback and focuses the
input on submission. Native validation messages clear when editing or when the
caller replaces the email. The future client controller owns validation against
the HTTP contract; browser email validity does not establish backend acceptance.
`emailError` supplies that caller-owned field feedback and blocks submission until
cleared. `requestError` appears in a persistent alert and does not mark the address
invalid. The caller decides when to clear external errors, including on retry.

While `pending`, the input is read-only and the existing Button pending treatment
blocks activation without removing focus. A form-level guard also blocks direct
submit events. A persistent status announces progress. Request failure retains the
draft and mounted controls. The component never starts a request or selects a route.

Form attributes, styles, classes, and the form ref are forwarded. The heading names
the form; `headingAs` defaults to `h1` and supports nesting beneath another heading.
Native reset is prevented to preserve the controlled draft; an optional `onReset`
handler can update it. Do not nest the component inside another form. Its parent
owns width, page layout, branding, and any surrounding content.

## Design and review

The [sign-in reference](<../../../../../design-system/Amends Screen · Sign in.dc.html>)
informs the heading, copy, email field, and full-width Continue action. Typography,
control sizes, and spacing use the reviewed UI components instead of the mock's
literal dimensions. Passkeys, Google sign-in, and legal links are outside this slice.

Storybook **Features / Sign in / Email form** covers empty, filled, field error,
pending, request error, both themes, panel/RTL, long content, and enlarged text.
Validation, Request Recovery, and Layout also run as portable stories. Workshop
controls simulate outcomes without HTTP and are not exported with the component.
Browser checks cover native Enter/Tab, focus retention, repeated pending activation,
disabled fieldsets, narrow layouts, accessibility, and reduced motion.
