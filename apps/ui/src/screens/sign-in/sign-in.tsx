import { For, Show, createEffect, createSignal, createUniqueId, on, onMount } from "solid-js"
import { Button } from "../../components/button/index.ts"
import { CodeInput } from "../../components/code-input/index.ts"
import { Divider } from "../../components/divider/index.ts"
import { Field } from "../../components/field/index.ts"
import { Input } from "../../components/input/index.ts"
import { Menu } from "../../components/menu/index.ts"
import { Centered } from "../../patterns/centered/index.ts"
import * as s from "./sign-in.css.ts"

export interface SignInProvider {
  readonly id: string
  /** Such as "Continue with Google". */
  readonly label: string
}

/** Why a code was not requested. */
export type SignInEmailError = "invalid-email" | "rate-limited" | "request-failed"

const emailErrors: { readonly [Error in SignInEmailError]: string } = {
  "invalid-email": "Enter a valid email address.",
  "rate-limited": "Too many codes were requested lately. Try again later.",
  "request-failed": "We couldn’t request a code. Try again."
}

export interface SignInEmailProps {
  readonly homeHref: string
  readonly email: string
  readonly onEmailChange: (email: string) => void
  readonly onSubmit: () => void
  /** A code is being requested. */
  readonly pending?: boolean
  readonly error?: SignInEmailError
  /** Other ways to sign in, shown under "or". */
  readonly providers?: ReadonlyArray<SignInProvider>
  /** Further providers, behind "More sign-in options". */
  readonly moreProviders?: ReadonlyArray<SignInProvider>
  readonly onProvider?: (id: string) => void
}

/** Sign-in's first step: an email address for a one-time code, and any other providers. */
export function SignInEmail(props: SignInEmailProps) {
  const heading = createUniqueId()
  const [input, setInput] = createSignal<HTMLInputElement>()
  // Each visit to this step starts in the field, including on return from the code.
  onMount(() => input()?.focus())
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
      </Centered.Header>
      <Centered.Body width="form">
        <div class={s.intro}>
          <h1 class={s.title} id={heading}>
            Sign in to amends
          </h1>
          <p class={s.lead}>Use your email to get a one-time code.</p>
        </div>
        <form
          class={s.form}
          aria-labelledby={heading}
          // The caller validates, so its message shows in the field rather than a browser bubble.
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!props.pending) props.onSubmit()
          }}
        >
          <Field.Root error={props.error === "invalid-email" ? emailErrors["invalid-email"] : undefined}>
            <Field.Label>Email</Field.Label>
            <Input
              ref={setInput}
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              value={props.email}
              onInput={(event) => props.onEmailChange(event.currentTarget.value)}
              required
            />
          </Field.Root>
          <Show when={props.error !== "invalid-email" && props.error}>
            {(error) => <Field.Alert>{emailErrors[error()]}</Field.Alert>}
          </Show>
          <Button type="submit" variant="primary" size="large" wide disabled={props.pending}>
            Continue
          </Button>
          <Show when={props.providers?.length || props.moreProviders?.length}>
            <Divider label="or" labelStyle="text" class={s.or} />
            <div class={s.providers}>
              <For each={props.providers}>
                {(provider) => (
                  <Button size="large" wide onClick={() => props.onProvider?.(provider.id)}>
                    {provider.label}
                  </Button>
                )}
              </For>
              <Show when={props.moreProviders?.length}>
                <Menu.Root>
                  <Menu.Trigger size="large" wide>
                    More sign-in options
                  </Menu.Trigger>
                  <Menu.Content aria-label="More sign-in options">
                    <For each={props.moreProviders}>
                      {(provider) => (
                        <Menu.Item onSelect={() => props.onProvider?.(provider.id)}>{provider.label}</Menu.Item>
                      )}
                    </For>
                  </Menu.Content>
                </Menu.Root>
              </Show>
            </div>
          </Show>
        </form>
        <p class={s.footnote}>Your workspaces appear after you sign in.</p>
      </Centered.Body>
    </Centered.Root>
  )
}

/** Why a code was not accepted or resent. */
export type SignInCodeError =
  | "invalid-code"
  | "mismatch"
  | "expired"
  | "unknown"
  | "verify-failed"
  | "resend-limited"
  | "resend-failed"

// The code's own problems mark the field; failed requests leave it valid.
const codeErrors: { readonly [Error in SignInCodeError]: { field?: string; form?: string } } = {
  "invalid-code": { field: "Enter all six digits." },
  mismatch: { field: "That code doesn’t match. Check it and try again." },
  expired: { field: "This code has expired. Request a new one." },
  unknown: { field: "This code is no longer available. Request a new one." },
  "verify-failed": { form: "We couldn’t verify your code. Try again." },
  "resend-limited": {
    form: "Too many codes were requested lately. Use the last one, or try later."
  },
  "resend-failed": { form: "We couldn’t request a new code. Try again." }
}

export interface SignInCodeProps {
  readonly homeHref: string
  /** Where the code went. */
  readonly email: string
  readonly onChangeEmail: () => void
  readonly code: string
  readonly onCodeChange: (code: string) => void
  readonly onSubmit: (code: string) => void
  readonly pending?: "verifying" | "resending"
  /** The code stays for editing. */
  readonly error?: SignInCodeError
  readonly onResend: () => void
  /** A new code went out, such as after Send again. */
  readonly resent?: boolean
  /** Where this host delivers codes, such as a terminal. Default: use the most recent code. */
  readonly deliveryHint?: string
}

/** Sign-in's second step: the six-digit code sent to the email address. */
export function SignInCode(props: SignInCodeProps) {
  const heading = createUniqueId()
  const [input, setInput] = createSignal<HTMLInputElement>()
  onMount(() => input()?.focus())
  // A new code clears the field; typing it starts there.
  createEffect(
    on(
      () => props.resent,
      (resent) => {
        if (resent) input()?.focus()
      },
      { defer: true }
    )
  )
  const error = () => (props.error ? codeErrors[props.error] : undefined)
  const submit = () => {
    if (!props.pending) props.onSubmit(props.code)
  }
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
      </Centered.Header>
      <Centered.Body width="form">
        <div class={s.intro}>
          <h1 class={s.title} id={heading}>
            Enter your code
          </h1>
          <p class={s.lead}>Enter the six-digit code for</p>
          <div class={s.recipient}>
            <span class={s.email}>{props.email}</span>
            <button type="button" class={s.link} onClick={() => props.onChangeEmail()}>
              Change email
            </button>
          </div>
        </div>
        <form
          class={s.form}
          aria-labelledby={heading}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field.Root hint={props.deliveryHint ?? "Use your most recent code."} error={error()?.field}>
            <Field.Label>Verification code</Field.Label>
            <CodeInput
              ref={setInput}
              value={props.code}
              onValueChange={props.onCodeChange}
              onComplete={(code) => {
                if (!props.pending) props.onSubmit(code)
              }}
            />
          </Field.Root>
          <Show when={error()?.form}>{(message) => <Field.Alert>{message()}</Field.Alert>}</Show>
          <Button
            type="submit"
            variant="primary"
            size="large"
            wide
            disabled={props.code.length < 6 || props.pending === "verifying"}
          >
            Verify code
          </Button>
        </form>
        <p class={s.sent} role="status">
          {props.resent ? "We sent a new code. Use the latest one." : ""}
        </p>
        <p class={s.resend}>
          Need a new code?
          <button
            type="button"
            class={s.strongLink}
            disabled={props.pending !== undefined}
            onClick={() => props.onResend()}
          >
            Send again
          </button>
        </p>
      </Centered.Body>
    </Centered.Root>
  )
}
