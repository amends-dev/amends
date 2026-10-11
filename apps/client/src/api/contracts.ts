// Application code reuses the backend wire schemas; visual layers stay independent.
import * as SignIn from "@amends-dev/gateway/SignIn";
export { SignIn };
export * as Accounts from "@amends-dev/gateway/Accounts";
export * as WorkspaceDirectory from "@amends-dev/gateway/WorkspaceDirectory";

export const Session = SignIn.Session;
export type Session = SignIn.Session;
