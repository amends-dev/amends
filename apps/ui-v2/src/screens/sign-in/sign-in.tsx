import { For, Show } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { CodeInput } from "../../components/code-input/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Menu } from "../../components/menu/index.ts";
import { Centered } from "../../patterns/centered/index.ts";
import * as s from "./sign-in.css.ts";

export interface SignInProvider {
  readonly id: string;
  /** Such as "Continue with Google". */
  readonly label: string;
}

export interface SignInEmailProps {
  readonly homeHref: string;
  readonly email: string;
  readonly onEmailChange: (email: string) => void;
  readonly onSubmit: () => void;
  readonly sending?: boolean;
  readonly error?: string;
  /** Other ways to sign in, shown under "or". */
  readonly providers?: readonly SignInProvider[];
  /** Further providers, behind "More sign-in options". */
  readonly moreProviders?: readonly SignInProvider[];
  readonly onProvider?: (id: string) => void;
}

/** Sign-in's first step: an email address for a one-time code, and any other providers. */
export function SignInEmail(props: SignInEmailProps) {
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
      </Centered.Header>
      <Centered.Body width="form">
        <div class={s.intro}>
          <h1 class={s.title}>Sign in to amends</h1>
          <p class={s.lead}>Use your email to get a one-time code.</p>
        </div>
        <form
          class={s.form}
          // The caller validates, so its message shows in the field rather than a browser bubble.
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!props.sending) props.onSubmit();
          }}
        >
          <Field.Root error={props.error}>
            <Field.Label>Email</Field.Label>
            <Input
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              value={props.email}
              onInput={(event) => props.onEmailChange(event.currentTarget.value)}
              required
            />
          </Field.Root>
          <Button type="submit" variant="primary" size="large" wide disabled={props.sending}>
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
                        <Menu.Item onSelect={() => props.onProvider?.(provider.id)}>
                          {provider.label}
                        </Menu.Item>
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
  );
}

export interface SignInCodeProps {
  readonly homeHref: string;
  /** Where the code went. */
  readonly email: string;
  readonly onChangeEmail: () => void;
  readonly code: string;
  readonly onCodeChange: (code: string) => void;
  readonly onSubmit: (code: string) => void;
  readonly verifying?: boolean;
  /** Such as "That code doesn’t match. Check it and try again." The code stays for editing. */
  readonly error?: string;
  readonly onResend: () => void;
  readonly resending?: boolean;
  /** A new code went out, such as after Send again. */
  readonly resent?: boolean;
}

/** Sign-in's second step: the six-digit code sent to the email address. */
export function SignInCode(props: SignInCodeProps) {
  const submit = () => {
    if (props.code.length === 6 && !props.verifying) props.onSubmit(props.code);
  };
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
      </Centered.Header>
      <Centered.Body width="form">
        <div class={s.intro}>
          <h1 class={s.title}>Enter your code</h1>
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
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field.Root
            hint={
              props.error
                ? undefined
                : props.resent
                  ? "We sent a new code."
                  : "Use your most recent code."
            }
            error={props.error}
          >
            <Field.Label>Verification code</Field.Label>
            <CodeInput
              value={props.code}
              onValueChange={props.onCodeChange}
              onComplete={(code) => {
                if (!props.verifying) props.onSubmit(code);
              }}
              autofocus
            />
          </Field.Root>
          <Button
            type="submit"
            variant="primary"
            size="large"
            wide
            disabled={props.code.length < 6 || props.verifying}
          >
            Verify code
          </Button>
        </form>
        <p class={s.resend}>
          Need a new code?
          <button
            type="button"
            class={s.strongLink}
            disabled={props.resending}
            onClick={() => props.onResend()}
          >
            Send again
          </button>
        </p>
      </Centered.Body>
    </Centered.Root>
  );
}
