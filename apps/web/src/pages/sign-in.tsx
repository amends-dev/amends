import { paths, useSignIn } from "@amends/client";
import { SignInCode, SignInEmail } from "@amends/ui/screens/sign-in";
import { Match, Switch } from "solid-js";

/** The email and code steps; the route resumes the intended page once a session exists. */
export function SignInPage() {
  const flow = useSignIn();
  const step = <Tag extends "Email" | "Code">(tag: Tag) => {
    const state = flow.state();
    return state._tag === tag ? (state as Extract<typeof state, { _tag: Tag }>) : undefined;
  };
  return (
    <Switch>
      <Match when={step("Email")}>
        {(state) => (
          <SignInEmail
            homeHref={paths.signIn}
            email={state().email}
            onEmailChange={flow.setEmail}
            onSubmit={() => flow.requestCode()}
            pending={state().pending}
            error={state().error}
          />
        )}
      </Match>
      <Match when={step("Code")}>
        {(state) => (
          <SignInCode
            homeHref={paths.signIn}
            email={state().email}
            onChangeEmail={flow.changeEmail}
            code={state().code}
            onCodeChange={flow.setCode}
            onSubmit={(code) => flow.verifyCode(code)}
            pending={state().pending}
            error={state().error}
            onResend={flow.resendCode}
            resent={state().resent}
            deliveryHint="Find your code in the terminal running the local host."
          />
        )}
      </Match>
    </Switch>
  );
}
