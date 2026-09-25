# Sign-in presentation

`SignInEmailForm` and `SignInCodeForm` are independent steps, exported from
`@amends/ui/features/sign-in`. They compose the existing controls and layout
primitives. Neither owns client, HTTP, session, navigation, or theme state.

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

## Email step

The caller owns the email draft, request lifetime, external errors, and next step.
`onEmailChange` receives the edited string; `onSubmit` receives the native field's
current value. The component performs no trimming or case conversion of its own.

Native required/email validation produces inline Field feedback and focuses the
input on submission. Native validation messages clear when editing or when the
caller replaces the email. The client controller owns validation against
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

## Code step

```tsx
<SignInCodeForm
  email={email()}
  code={code()}
  onCodeChange={setCode}
  onSubmit={verifyCode}
  onResend={requestAnotherCode}
  onChangeEmail={returnToEmail}
  pending={pending()}
  codeError={codeError()}
  requestError={requestError()}
  notice={notice()}
/>
```

The caller owns the code draft and all three actions. Verification requires an
explicit submit and six ASCII digits, preserving leading zeros. Inline native
validation focuses the code input; `codeError` adds caller-owned feedback such as
wrong, expired, or unavailable codes. `requestError` is a separate alert and never
marks the code invalid. The caller clears external errors when appropriate.

`pending` is `undefined`, `"verifying"`, or `"resending"`. The active action retains focus and shows the
Button pending treatment; the other request action is disabled and the code is
read-only. Form and action guards also prevent direct duplicate requests. Change
email stays available, including while pending; the caller must cancel obsolete
work and choose the next view.

Resend does not require a valid code. It clears native validation feedback but
does not clear the draft or external errors. After a successful resend, the caller
can clear the code and supply a `notice`, announced in the persistent status region.
Pending progress takes precedence over that notice. Code and feedback updates keep
the input mounted. Native reset follows the email form's controlled-reset contract.

`deliveryHint` supplies retrieval guidance; its default is “Use your most recent
code.” The component makes no claim about email delivery, device binding, expiry
times, or resend cooldowns. The connected feature must supply guidance for its host.
The email is isolated with `bdi` so it remains readable within RTL copy.

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

**Features / Sign in / Code form** covers verification, resend, wrong/expired/
unavailable codes, request failure, resend notices, delivery guidance, and pending
email changes. Validation, Verify Recovery, Resend Recovery, Change Email, and Layout
run as portable stories. Browser review adds native paste/selection, disabled-fieldset
guards, RTL, both themes, and CodeInput's compact layout with enlarged text.
CodeInput's clipped area can produce an inconclusive axe contrast result; the
rendered code text/surface pairs are also checked directly in the browser.
