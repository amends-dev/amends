import { paths, useSession } from "@amends-dev/client";
import { NotFoundScreen } from "@amends-dev/ui/screens/standalone";
import { useNavigate } from "@solidjs/router";
import { useStandaloneAccount } from "../account.ts";

/** An address that matches no route, for guests and signed-in people alike. */
export function NotFoundPage() {
  const session = useSession();
  const account = useStandaloneAccount();
  const navigate = useNavigate();
  return (
    <NotFoundScreen
      homeHref="#/"
      account={account()}
      signedIn={session.session !== undefined}
      onContinue={() => navigate(session.session ? paths.workspaces : paths.signIn)}
    />
  );
}
