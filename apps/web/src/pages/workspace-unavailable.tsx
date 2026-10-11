import { paths, useSession, useWorkspaceAccess } from "@amends-dev/client";
import { WorkspaceUnavailableScreen } from "@amends-dev/ui/screens/standalone";
import { useNavigate } from "@solidjs/router";
import { useStandaloneAccount } from "../account.ts";

/** Shown when a workspace route has no active membership. */
export function WorkspaceUnavailablePage(props: { readonly workspaceId: string }) {
  const session = useSession();
  const account = useStandaloneAccount();
  const access = useWorkspaceAccess(() => props.workspaceId);
  const navigate = useNavigate();
  return (
    <WorkspaceUnavailableScreen
      homeHref="/"
      account={account()}
      identity={session.session?.account.email ?? "this address"}
      access={access()}
      onWorkspaces={() => navigate(paths.workspaces)}
    />
  );
}
