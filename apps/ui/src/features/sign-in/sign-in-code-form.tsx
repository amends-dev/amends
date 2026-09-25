import { createEffect, createSignal, createUniqueId, on, splitProps, type JSX } from "solid-js";
import { Field } from "../../compositions/field/index.ts";
import { Button } from "../../primitives/button/index.ts";
import { CodeInput } from "../../primitives/code-input/index.ts";
import { Column, Row } from "../../primitives/layout/index.ts";
import { Text } from "../../primitives/text/index.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./sign-in-form.css.ts";

export type SignInCodeFormProps = Omit<
  JSX.FormHTMLAttributes<HTMLFormElement>,
  "children" | "onSubmit" | "noValidate" | "novalidate"
> & {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeEmail: () => void;
  pending?: "verifying" | "resending";
  codeError?: string;
  requestError?: string;
  /** Non-pending feedback, such as a successful resend. The caller owns delivery. */
  notice?: string;
  deliveryHint?: string;
  headingAs?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
};

/** Code-step presentation. The caller owns verification, delivery, and flow transitions. */
export function SignInCodeForm(props: SignInCodeFormProps): JSX.Element {
  const [local, native] = splitProps(props, [
    "email",
    "code",
    "onCodeChange",
    "onSubmit",
    "onResend",
    "onChangeEmail",
    "pending",
    "codeError",
    "requestError",
    "notice",
    "deliveryHint",
    "headingAs",
    "class",
    "classList",
    "onReset",
    "aria-labelledby",
  ]);
  const id = createUniqueId();
  let input!: HTMLInputElement;
  const [nativeError, setNativeError] = createSignal<string>();
  createEffect(on([() => local.code, () => local.email], () => setNativeError(undefined)));
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => {
    event.preventDefault();
    if (local.pending || input.matches(":disabled")) return;
    if (!input.reportValidity()) return;
    if (local.codeError) {
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
        event.preventDefault();
        setNativeError(undefined);
        callHandler(local.onReset, event);
      }}
    >
      <Column gap={2}>
        <Text as={local.headingAs ?? "h1"} variant="heading" id={`${id}-heading`}>
          Enter your code
        </Text>
        <Text tone="secondary">
          Enter the six-digit code for <bdi>{local.email}</bdi>.
        </Text>
      </Column>
      <Column gap={4}>
        <Field
          label="Six-digit code"
          required
          description={local.deliveryHint ?? "Use your most recent code."}
          error={local.codeError || nativeError()}
          aria-live="polite"
        >
          {(control) => (
            <CodeInput
              ref={(element) => {
                input = element;
              }}
              name="code"
              value={local.code}
              readOnly={local.pending !== undefined}
              onInput={(event) => {
                setNativeError(undefined);
                local.onCodeChange(event.currentTarget.value);
              }}
              onInvalid={(event) => {
                event.preventDefault();
                setNativeError(
                  input.validity.valueMissing ? "Enter your code." : "Enter all six digits.",
                );
                input.focus();
              }}
              {...control}
            />
          )}
        </Field>
        <div>
          <Button
            type="submit"
            pending={local.pending === "verifying"}
            disabled={local.pending === "resending"}
            class={s.submit}
          >
            Verify code
          </Button>
          <Text role="status" aria-atomic="true" tone="secondary" class={s.feedback}>
            {local.pending === "verifying"
              ? "Verifying your code…"
              : local.pending === "resending"
                ? "Requesting a new code…"
                : (local.notice ?? "")}
          </Text>
          <Text role="alert" aria-atomic="true" tone="danger" class={s.feedback}>
            {local.requestError ?? ""}
          </Text>
        </div>
        <Row>
          <Button
            type="button"
            variant="secondary"
            pending={local.pending === "resending"}
            disabled={local.pending === "verifying"}
            onClick={() => {
              if (local.pending || input.matches(":disabled")) return;
              setNativeError(undefined);
              local.onResend();
            }}
          >
            Send again
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              if (!input.matches(":disabled")) local.onChangeEmail();
            }}
          >
            Change email
          </Button>
        </Row>
      </Column>
    </Column>
  );
}
