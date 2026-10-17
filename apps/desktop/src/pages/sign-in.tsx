import { paths, useSignIn, SignInState } from "@amends-dev/client"
import { SignInCode, SignInEmail } from "@amends-dev/ui/screens/sign-in"
import { Match, Switch } from "solid-js"

/** The email and code steps; the route resumes the intended page once a session exists. */
export function SignInPage() {
  const flow = useSignIn()
  const step = <Tag extends "Email" | "Code">(tag: Tag) => {
    const state = flow.state()
    return SignInState.$is(tag)(state) ? state : undefined
  }
  return (
    <Switch>
      <Match when={step("Email")}>
        {(state) => (
          <SignInEmail
            homeHref={`#${paths.signIn}`}
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
            homeHref={`#${paths.signIn}`}
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
  )
}
