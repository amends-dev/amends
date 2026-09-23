// Application code reuses the backend wire schemas; visual layers stay independent.
import { SignIn } from "@amends/gateway/sign-in";
export { SignIn };
export { WorkspaceDirectory } from "@amends/gateway/directory";

export const Session = SignIn.Session;
export type Session = SignIn.Session;
