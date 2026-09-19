import { AccountPopover, Shell } from "@amends/ui/components";
import { useNavigate } from "@solidjs/router";
import { batch, Show, useContext } from "solid-js";
import { useSession } from "../../session/boundary.tsx";
import { useTheme } from "../../theme/theme.ts";
import { WorkspaceContext } from "../../workspace/context.tsx";
import { href } from "../../routes.tsx";
export function AccountMenu() {
  const session = useSession();
  const workspace = useContext(WorkspaceContext);
  const sidebar = Shell.useSidebar();
  const theme = useTheme();
  const navigate = useNavigate();
  return (
    <Show when={session.session}>
      {(signedIn) => (
        <AccountPopover
          name={signedIn().humanId}
          identityDescription="Signed in with a one-time email code on this host."
          theme={theme}
          compact={sidebar.compact()}
          placement={sidebar.compact() ? "top-start" : "bottom-end"}
          {...(workspace
            ? {
                onSettings: () => {
                  if (session.isCurrent()) {
                    sidebar.close();
                    navigate(href.settings(workspace().workspace.id));
                  }
                },
              }
            : {})}
          onSignOut={() => {
            if (session.isCurrent())
              batch(() => {
                navigate(href.signIn(), { replace: true });
                session.replace(undefined);
              });
          }}
        />
      )}
    </Show>
  );
}
