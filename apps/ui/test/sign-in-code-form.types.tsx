import { SignInCodeForm } from "@amends/ui/features/sign-in";

export function signInCodeFormTypeExamples() {
  const props = {
    email: "jo@mercier.co",
    code: "001234",
    onCodeChange: (_code: string) => {},
    onSubmit: (_code: string) => {},
    onResend: () => {},
    onChangeEmail: () => {},
  };
  <SignInCodeForm {...props} pending="verifying" headingAs="h2" />;
  <SignInCodeForm {...props} pending="resending" deliveryHint="Use the latest code." />;
  // @ts-expect-error A pending action must identify which request is running.
  <SignInCodeForm {...props} pending={true} />;
  // @ts-expect-error Leading zeros require a string code.
  <SignInCodeForm {...props} code={123456} />;
  // @ts-expect-error Submission is a value callback, not a native event.
  <SignInCodeForm {...props} onSubmit={(event: SubmitEvent) => event} />;
  // @ts-expect-error The caller must supply the flow actions.
  <SignInCodeForm email="jo@mercier.co" code="" />;
}
