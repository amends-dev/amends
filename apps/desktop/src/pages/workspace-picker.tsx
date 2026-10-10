import {
  paths,
  useCreateWorkspace,
  useWorkspacePicker,
  CreateWorkspaceState,
} from "@amends-dev/client";
import { CreateWorkspace, WorkspacePicker } from "@amends-dev/ui/screens/workspaces";
import { useMatch, useNavigate } from "@solidjs/router";
import { createEffect, Show } from "solid-js";
import { useStandaloneAccount } from "../account.ts";

/** The reader's workspaces and invitations. Creating one opens over it at its own address. */
export function WorkspacePickerPage() {
  const picker = useWorkspacePicker();
  const account = useStandaloneAccount();
  const navigate = useNavigate();
  const creating = useMatch(() => paths.createWorkspace);
  return (
    <Show when={account()}>
      {(account) => (
        <>
          <WorkspacePicker
            homeHref="#/"
            account={account()}
            workspaces={picker.workspaces().map((workspace) => ({
              ...workspace,
              href: `#${paths.workspace(workspace.id)}`,
            }))}
            invitations={picker.invitations()}
            refreshFailed={picker.refreshFailed()}
            onRetry={picker.retry}
            accept={picker.accepting()}
            suggestedName={picker.suggestedName()}
            onAccept={picker.accept}
            onCreateWorkspace={() => navigate(paths.createWorkspace)}
          />
          <Show when={creating()}>
            <CreateWorkspaceDialog />
          </Show>
        </>
      )}
    </Show>
  );
}

/** One creation intent, for as long as the dialog is open; it opens the workspace it creates. */
function CreateWorkspaceDialog() {
  const creation = useCreateWorkspace();
  const navigate = useNavigate();
  createEffect(() => {
    const state = creation.state();
    if (CreateWorkspaceState.$is("Ready")(state))
      navigate(paths.workspace(state.workspace.id), { replace: true });
  });
  const form = () => {
    const state = creation.state();
    return CreateWorkspaceState.$is("Form")(state) ? state : undefined;
  };
  const created = () => {
    const state = creation.state();
    return CreateWorkspaceState.$is("Created")(state)
      ? { name: state.workspace.name, pending: state.pending, refreshFailed: state.refreshFailed }
      : undefined;
  };
  return (
    <CreateWorkspace
      open
      onClose={() => navigate(paths.workspaces)}
      name={form()?.name ?? ""}
      onNameChange={creation.setName}
      memberName={form()?.memberName ?? ""}
      onMemberNameChange={creation.setMemberName}
      pending={form()?.pending}
      error={form()?.error}
      onCreate={() => creation.submit()}
      created={created()}
      onRetry={creation.retryRefresh}
    />
  );
}
