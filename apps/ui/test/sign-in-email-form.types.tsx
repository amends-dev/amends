import { SignInEmailForm } from "@amends/ui/features/sign-in";

export function signInEmailFormTypeExamples() {
  <SignInEmailForm
    email=""
    onEmailChange={(email: string) => email}
    onSubmit={(email: string) => email}
    headingAs="h2"
  />;
  // @ts-expect-error Draft and actions belong to the caller.
  <SignInEmailForm />;
  // @ts-expect-error Submission is a value callback, not a native event.
  <SignInEmailForm email="" onEmailChange={() => {}} onSubmit={(event: SubmitEvent) => event} />;
  // @ts-expect-error Form parts are composed by this feature, not injected as children.
  <SignInEmailForm email="" onEmailChange={() => {}} onSubmit={() => {}}>
    Other inputs
  </SignInEmailForm>;
}
