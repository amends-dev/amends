import { createEffect, createSignal, createUniqueId, splitProps, type JSX } from "solid-js";
import { Field } from "../../compositions/field/index.ts";
import { Button } from "../../primitives/button/index.ts";
import { Input } from "../../primitives/input/index.ts";
import { Column } from "../../primitives/layout/index.ts";
import { Text } from "../../primitives/text/index.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./sign-in-email-form.css.ts";

export type SignInEmailFormProps = Omit<
  JSX.FormHTMLAttributes<HTMLFormElement>,
  "children" | "onSubmit" | "noValidate" | "novalidate"
> & {
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (email: string) => void;
  pending?: boolean;
  /** A caller-owned validation message, independent of request failures. */
  emailError?: string;
  requestError?: string;
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

/** Email-step presentation. The caller owns the draft, request, and next step. */
export function SignInEmailForm(props: SignInEmailFormProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "email",
    "onEmailChange",
    "onSubmit",
    "pending",
    "emailError",
    "requestError",
    "headingAs",
    "class",
    "classList",
    "onReset",
    "aria-labelledby",
  ]);
  const id = createUniqueId();
  let input!: HTMLInputElement;
  const [nativeError, setNativeError] = createSignal<string>();
  createEffect(() => {
    const email = local.email;
    // Keep controlled updates from rewriting the same value during native editing.
    if (input.value !== email) input.value = email;
    setNativeError(undefined);
  });
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault();
    if (local.pending || input.matches(":disabled")) return;
    if (!input.reportValidity()) return;
    if (local.emailError) {
      input.focus();
      return;
    }
    local.onSubmit(input.value);
  };
  return (
    <Column
      {...native}
      as="form"
      gap={6}
      class={classes(s.root, local.class, local.classList)}
      aria-labelledby={local["aria-labelledby"] ?? `${id}-heading`}
      onSubmit={submit}
      onReset={(event) => {
        // A native reset must not diverge from the caller's controlled draft.
        event.preventDefault();
        setNativeError(undefined);
        callHandler(local.onReset, event);
      }}
    >
      <Column gap={2}>
        <Text as={local.headingAs ?? "h1"} variant="heading" id={`${id}-heading`}>
          Sign in to amends
        </Text>
        <Text tone="secondary">
          One address, one identity. Whichever workspaces you belong to appear after this.
        </Text>
      </Column>
      <Column gap={4}>
        <Field label="Email" required error={local.emailError || nativeError()} aria-live="polite">
          {(control) => (
            <Input
              ref={(element) => {
                input = element;
              }}
              type="email"
              name="email"
              autocomplete="email"
              inputmode="email"
              autocapitalize="none"
              spellcheck={false}
              placeholder="you@where-you-work.com"
              readOnly={local.pending}
              onInput={(event) => {
                setNativeError(undefined);
                local.onEmailChange(event.currentTarget.value);
              }}
              onInvalid={(event) => {
                event.preventDefault();
                setNativeError(
                  input.validity.valueMissing
                    ? "Enter your email address."
                    : "Enter a valid email address.",
                );
                input.focus();
              }}
              {...control}
            />
          )}
        </Field>
        <div>
          <Button type="submit" pending={local.pending} class={s.submit}>
            Continue
          </Button>
          <Text role="status" aria-atomic="true" tone="secondary" class={s.feedback}>
            {local.pending ? "Requesting a sign-in code…" : ""}
          </Text>
          <Text role="alert" aria-atomic="true" tone="danger" class={s.feedback}>
            {local.requestError ?? ""}
          </Text>
        </div>
      </Column>
    </Column>
  );
}
