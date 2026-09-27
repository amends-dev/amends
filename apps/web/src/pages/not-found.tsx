import { paths, useSession } from "@amends/client";
import { NotFoundScreen } from "@amends/ui-v2/screens/standalone";
import { useNavigate } from "@solidjs/router";
import { useStandaloneAccount } from "../account.ts";

/** An address that matches no route, for guests and signed-in people alike. */
export function NotFoundPage() {
  const session = useSession();
  const account = useStandaloneAccount();
  const navigate = useNavigate();
  return (
    <NotFoundScreen
      homeHref="/"
      account={account()}
      signedIn={session.session !== undefined}
      onContinue={() => navigate(session.session ? paths.workspaces : paths.signIn)}
    />
  );
}
