import { SignIn } from "@amends/gateway/sign-in";
import {
  Button,
  CodeField,
  Field,
  PageHeading,
  SectionStack,
  Text,
  TextField,
} from "@amends/ui/components";
import { Cause, Exit, Option, Schema } from "effect";
import { createSignal, Match, Switch } from "solid-js";
import { Session } from "../../api/session.ts";
import { useCommand } from "../../api/hooks.ts";
import * as s from "./sign-in-form.css.ts";

const isEmail = Schema.is(SignIn.Email);
const isCode = Schema.is(SignIn.Code);
const rejection = (reason: SignIn.Rejected["reason"]) =>
  reason === "mismatch"
    ? "That code did not match. Check the message and try again."
    : reason === "expired"
      ? "That code has expired. Send a new one."
      : "No code is waiting for this address. Send a new one.";

export function SignInForm(props: { onSignedIn: (session: SignIn.Session) => void }) {
  const [step, setStep] = createSignal<"email" | "code">("email");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const starting = useCommand(Session.makeStart());
  const completing = useCommand(Session.makeComplete());
  const busy = () => starting.pending() || completing.pending();

  const sendCode = async () => {
    if (busy()) return;
    const address = email().trim();
    if (!isEmail(address)) {
      setProblem("Enter the address you use for work.");
      return;
    }
    setProblem(undefined);
    const exit = await starting.run(address);
    if (!exit) return;
    if (Exit.isSuccess(exit)) {
      setCode("");
      setStep("code");
      return;
    }
    setProblem("The code could not be sent. Try again in a moment.");
  };
  const verify = async (value: string) => {
    const address = email().trim();
    if (busy() || !isCode(value) || !isEmail(address)) return;
    setProblem(undefined);
    const exit = await completing.run({ email: address, code: value });
    if (!exit) return;
    if (Exit.isSuccess(exit)) {
      props.onSignedIn(exit.value);
      return;
    }
    const error = Cause.findErrorOption(exit.cause);
    setProblem(
      Option.isSome(error) && Schema.is(SignIn.Rejected)(error.value)
        ? rejection(error.value.reason)
        : "The code could not be checked. Try again in a moment.",
    );
    setCode("");
  };
  const typeCode = (digits: string) => {
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  };

  return (
    <Switch>
      <Match when={step() === "email"}>
        <SectionStack>
          <PageHeading
            title="Sign in to amends"
            description="One address, one identity. Whichever workspaces you belong to appear after this."
          />
          <form
            class={s.stack}
            novalidate
            onSubmit={(event) => {
              event.preventDefault();
              void sendCode();
            }}
          >
            <Field label="Email" error={problem()}>
              <TextField
                type="email"
                name="email"
                autocomplete="email"
                placeholder="you@where-you-work.com"
                value={email()}
                readOnly={busy()}
                onInput={(event) => setEmail(event.currentTarget.value)}
              />
            </Field>
            <Button
              type="submit"
              variant="primary"
              size="touch"
              pending={busy()}
              class={s.fullWidth}
            >
              continue
            </Button>
            <Text as="span" variant="label" tone="muted" class={s.divider}>
              OR
            </Text>
            <div class={s.options}>
              <Button variant="secondary" size="touch" disabled class={s.fullWidth}>
                use a passkey
              </Button>
              <Button variant="secondary" size="touch" disabled class={s.fullWidth}>
                continue with Google
              </Button>
              <Text as="span" variant="caption" tone="muted">
                Passkeys and Google are not set up on this host yet.
              </Text>
            </div>
            <Text variant="bodySmall" tone="muted">
              New here? The same button makes an account. By continuing you agree to the terms and
              the privacy notice.
            </Text>
          </form>
        </SectionStack>
      </Match>
      <Match when={step() === "code"}>
        <SectionStack>
          <PageHeading
            title="Check your email"
            description="We sent a six-digit code. It works once, on this device."
          />
          <div class={s.stack}>
            <CodeField
              label="Six-digit code"
              value={code()}
              onInput={typeCode}
              disabled={busy()}
              error={problem()}
            />
            <span class={s.rule} />
            <div class={s.actions}>
              <Text as="span" variant="caption" tone="muted" class={s.spread}>
                code sent to {email().trim()} · expires in 10 minutes
              </Text>
              <Button
                variant="secondary"
                size="compact"
                pending={busy()}
                onClick={() => void sendCode()}
              >
                send again
              </Button>
              <Button
                variant="ghost"
                size="compact"
                disabled={busy()}
                onClick={() => {
                  setProblem(undefined);
                  setStep("email");
                }}
              >
                change email
              </Button>
            </div>
          </div>
        </SectionStack>
      </Match>
    </Switch>
  );
}
