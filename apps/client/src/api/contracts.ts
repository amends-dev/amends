// Application code reuses the backend wire schemas; visual layers stay independent.
import * as SignIn from "@amends-dev/gateway/sign-in";
export { SignIn };
export * as Accounts from "@amends-dev/gateway/accounts";
export * as WorkspaceDirectory from "@amends-dev/gateway/directory";

export const Session = SignIn.Session;
export type Session = SignIn.Session;
