import { SignIn } from "@amends/gateway/sign-in";
import { Button, CodeField, Field, Text, TextField } from "@amends/ui/components";
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Navigate, useNavigate } from "@solidjs/router";
import { Cause, Exit, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createSignal, Match, Switch } from "solid-js";
import { ApiClient } from "../../api/client.ts";
import { href } from "../../routes.tsx";
import { sessionAtom } from "../../session/session.ts";
import * as s from "./entry.css.ts";
import { Entry } from "./shell.tsx";

const isEmail = Schema.is(SignIn.Email);
const isCode = Schema.is(SignIn.Code);
const rejection = (reason: SignIn.Rejected["reason"]) =>
  reason === "mismatch"
    ? "That code did not match. Check the message and try again."
    : reason === "expired"
      ? "That code has expired. Send a new one."
      : "No code is waiting for this address. Send a new one.";

/** Email and one-time code; a session appears after the code, then the picker. */
export function SignInPage() {
  const session = useAtomValue(() => sessionAtom);
  return (
    <Switch>
      <Match when={session() !== undefined}>
        <Navigate href={href.picker()} />
      </Match>
      <Match when={session() === undefined}>
        <SignInFlow />
      </Match>
    </Switch>
  );
}

function SignInFlow() {
  const navigate = useNavigate();
  const setSession = useAtomSet(() => sessionAtom);
  const [step, setStep] = createSignal<"email" | "code">("email");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [problem, setProblem] = createSignal<string>();
  const [starting, start] = useAtom(() => ApiClient.mutation("session", "start"), {
    mode: "promiseExit",
  });
  const [completing, complete] = useAtom(() => ApiClient.mutation("session", "complete"), {
    mode: "promiseExit",
  });
  const busy = () => AsyncResult.isWaiting(starting()) || AsyncResult.isWaiting(completing());

  const sendCode = async () => {
    const address = email().trim();
    if (!isEmail(address)) {
      setProblem("Enter the address you use for work.");
      return;
    }
    setProblem(undefined);
    const exit = await start({ payload: { email: address } });
    if (Exit.isSuccess(exit)) {
      setCode("");
      setStep("code");
      return;
    }
    setProblem("The code could not be sent. Try again in a moment.");
  };
  const verify = async (value: string) => {
    if (!isCode(value)) return;
    setProblem(undefined);
    const exit = await complete({ payload: { email: email().trim(), code: value } });
    if (Exit.isSuccess(exit)) {
      setSession(exit.value);
      navigate(href.picker(), { replace: true });
      return;
    }
    const error = Cause.findErrorOption(exit.cause);
    setProblem(
      Option.isSome(error)
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
        <Entry
          title="Sign in to amends"
          blurb="One address, one identity. Whichever workspaces you belong to appear after this."
        >
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
        </Entry>
      </Match>
      <Match when={step() === "code"}>
        <Entry
          title="Check your email"
          blurb="We sent a six-digit code. It works once, on this device."
        >
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
                onClick={() => {
                  setProblem(undefined);
                  setStep("email");
                }}
              >
                change email
              </Button>
            </div>
          </div>
        </Entry>
      </Match>
    </Switch>
  );
}
