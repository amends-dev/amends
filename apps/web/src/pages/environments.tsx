import {
  paths,
  useConnections,
  useEnvironments,
  useWorkspace,
  type EnvironmentAction,
  type EnvironmentEntry,
} from "@amends/client";
import { ConfigureConnection, ConnectionKey } from "@amends/ui/screens/connections";
import {
  AddEnvironment,
  ConfirmRemoveEnvironment,
  EnvironmentPane,
  EnvironmentList,
  EnvironmentsPane,
  environmentsToast,
  type EnvironmentTab,
  type EnvironmentsTab,
} from "@amends/ui/screens/environments";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => path;

export function EnvironmentsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Environments workspaceId={workspaceId} />}
    </Show>
  );
}

type Dialog = "add" | "remove" | "create-account" | "account-key";

/**
 * A workspace's environments: the list, All or Needs setup by `?tab=`, or one environment's page by
 * its path, Overview or Sandbox. `?add=environment` opens Add environment over either, as the
 * sidebar's + does. Adding takes its basics, then its sandbox settings; an account it needs can be
 * created on the way, returning to the draft with that account chosen.
 */
function Environments(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const params = useParams<{ environmentId?: string; tab?: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string; add?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  const [query, setQuery] = createSignal("");
  // Where the account detour returns: the draft being added, or an environment's settings.
  const [detour, setDetour] = createSignal<{ readonly environmentId?: string }>();
  const base = paths.workspacePage(workspaceId, "environments");
  const environmentPath = (environmentId: string, tab: EnvironmentTab = "overview") =>
    paths.environment(workspaceId, environmentId, tab === "sandbox" ? "sandbox" : undefined);
  const view = useEnvironments(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) navigate(environmentPath(done.created));
      if (done.action === "remove") navigate(base);
      actions.toast(environmentsToast(done.action, done.subject));
      setDialog(undefined);
    },
  });
  /** Back from the account detour, with the account it created chosen. */
  const returnFromDetour = (accountId: string | undefined) => {
    const from = detour();
    setDetour(undefined);
    if (from?.environmentId !== undefined) {
      if (accountId) view.configure.sandbox(from.environmentId).setAccount(accountId);
      setDialog(undefined);
      navigate(environmentPath(from.environmentId, "sandbox"));
    } else {
      if (accountId) view.create.sandbox.setAccount(accountId);
      setDialog(view.create.active() ? "add" : undefined);
    }
  };
  // The account the detour created, kept while its key is asked for.
  const [created, setCreated] = createSignal<string>();
  const connections = useConnections(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) {
        setCreated(done.created);
        if (done.method === "api-key") {
          setDialog("account-key");
          return;
        }
        returnFromDetour(done.created);
      }
      if (done.action === "set-key") {
        actions.toast("API key saved");
        returnFromDetour(created());
      }
    },
  });
  const startDetour = (environmentId?: string) => {
    const provider = environmentId
      ? view.environment(environmentId)?.sandbox?.providerId
      : view.create.providerId();
    const implementation = connections
      .providers()
      .find((candidate) => candidate.sandboxProvider === provider);
    if (!implementation) return;
    view.dismiss();
    connections.create.begin(implementation.id);
    setDetour(environmentId === undefined ? {} : { environmentId });
    setDialog("create-account");
  };
  const open = (next: Dialog) => {
    view.dismiss();
    setDialog(next);
  };
  /** Leaves `?add=environment` for the page under it; the effect below sets the draft aside. */
  const closeAdd = () => setSearch({ add: undefined });
  const close = () => {
    view.dismiss();
    if (dialog() === "add") return closeAdd();
    setDialog(undefined);
  };
  // `?add=environment` opens Add environment over the page; leaving it sets the draft aside.
  createEffect(
    on(
      () => search.add === "environment" && view.canCreate(),
      (adding) => {
        if (adding) {
          view.dismiss();
          if (!view.create.active()) view.create.begin();
          setDialog("add");
        } else if (view.create.active() && detour()?.environmentId === undefined) {
          view.create.cancel();
          setDetour(undefined);
          setDialog(undefined);
        }
      },
    ),
  );
  const failureOf = (action: EnvironmentAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure : undefined;
  };
  const pending = (action: EnvironmentAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const tab = (): EnvironmentsTab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return view
      .environments()
      .filter(
        (environment) =>
          (tab() === "all" || environment.issues.length > 0) &&
          (words === "" || environment.name.toLocaleLowerCase().includes(words)),
      );
  });
  const selected = (): EnvironmentEntry | undefined =>
    params.environmentId === undefined ? undefined : view.environment(params.environmentId);
  const add = () => setSearch({ add: "environment" });
  /** The draft's name, or the environment's, for the account detour to name where it returns. */
  const returnTo = () => {
    const from = detour();
    return from?.environmentId === undefined
      ? view.create.name().trim() || "New environment"
      : (view.environment(from.environmentId)?.name ?? "your environment");
  };
  const editorProps = (editor: ReturnType<typeof view.configure.sandbox>, providerId: string) => ({
    accounts: view.accounts(providerId),
    accountId: editor.draft().accountId,
    onAccountChange: editor.setAccount,
    template: editor.draft().template,
    onTemplateChange: editor.setTemplate,
    variables: editor.draft().variables,
    onAddVariable: editor.addVariable,
    onVariableChange: editor.setVariable,
    onRemoveVariable: editor.removeVariable,
    variableIssue: editor.variableIssue,
    commands: editor.draft().commands,
    onAddCommand: editor.addCommand,
    onCommandChange: editor.setCommand,
    onMoveCommand: editor.moveCommand,
    onRemoveCommand: editor.removeCommand,
    retention: editor.draft().retention,
    onRetentionChange: editor.setRetention,
  });
  return (
    <>
      <Show
        when={params.environmentId}
        keyed
        fallback={
          <EnvironmentsPane
            workspaceName={name()}
            tab={tab()}
            tabHref={(next) => href(next === "needs-setup" ? `${base}?tab=needs-setup` : base)}
            onTabChange={(next) =>
              setSearch({ tab: next === "needs-setup" ? "needs-setup" : undefined })
            }
            counts={
              view.status()
                ? undefined
                : {
                    all: view.environments().length,
                    needsSetup: view.environments().filter((entry) => entry.issues.length > 0)
                      .length,
                  }
            }
            onAdd={view.canCreate() ? add : undefined}
            status={view.status()}
            onRetry={view.refresh}
          >
            <EnvironmentList
              tab={tab()}
              query={query()}
              onQueryChange={setQuery}
              environments={shown()}
              total={view.environments().length}
              environmentHref={(id) => href(environmentPath(id))}
              onAdd={view.canCreate() ? add : undefined}
              failure={
                view.failure()?.action === "refresh" && !dialog() ? view.failure() : undefined
              }
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          </EnvironmentsPane>
        }
      >
        {(environmentId) => {
          const editor = () => view.configure.sandbox(environmentId);
          return (
            <EnvironmentPane
              workspaceName={name()}
              environment={selected()}
              status={view.status()}
              onRetry={view.refresh}
              onBrowse={() => navigate(base)}
              tab={params.tab === "sandbox" ? "sandbox" : "overview"}
              tabHref={(next) => href(environmentPath(environmentId, next))}
              onTabChange={(next) => navigate(environmentPath(environmentId, next))}
              name={view.rename.name(environmentId)}
              onNameChange={(value) => view.rename.setName(environmentId, value)}
              nameChanged={view.rename.changed(environmentId)}
              onSaveName={() => view.rename.save(environmentId)}
              sandbox={
                selected()?.sandbox
                  ? {
                      ...editorProps(editor(), selected()!.sandbox!.providerId),
                      onCreateAccount: () => startDetour(environmentId),
                    }
                  : undefined
              }
              sandboxChanged={view.configure.changed(environmentId)}
              onSaveSandbox={() => view.configure.save(environmentId)}
              onDiscardSandbox={() => {
                view.configure.reset(environmentId);
                view.dismiss();
                navigate(environmentPath(environmentId));
              }}
              onOpenAccount={() => {
                const account = selected()?.sandbox?.account?.id;
                if (account) navigate(paths.connection(workspaceId, account));
              }}
              onRemove={() => open("remove")}
              pending={view.pending()}
              failure={dialog() ? undefined : view.failure()}
              onRefresh={view.refresh}
            />
          );
        }}
      </Show>
      <AddEnvironment
        open={dialog() === "add"}
        onClose={close}
        step={view.create.step()}
        name={view.create.name()}
        onNameChange={view.create.setName}
        harnesses={view.harnesses()}
        harnessId={view.create.harnessId()}
        onHarnessChange={view.create.setHarness}
        providers={view.providers()}
        providerId={view.create.providerId()}
        onProviderChange={view.create.setProvider}
        placements={view.create.placements()}
        placement={view.create.placement()}
        onPlacementChange={view.create.setPlacement}
        basicsReady={view.create.basicsReady()}
        onContinue={view.create.next}
        onBack={() => {
          view.dismiss();
          view.create.back();
        }}
        sandbox={{
          ...editorProps(view.create.sandbox, view.create.providerId() ?? ""),
          onCreateAccount: () => startDetour(),
        }}
        ready={view.create.ready()}
        onCreate={view.create.save}
        pending={pending("create")}
        error={failureOf("create")?.error}
        problems={failureOf("create")?.problems}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <Show when={connections.create.provider()}>
        {(provider) => (
          <ConfigureConnection
            open={dialog() === "create-account"}
            onClose={() => {
              connections.create.cancel();
              returnFromDetour(undefined);
            }}
            onBack={() => {
              connections.create.cancel();
              returnFromDetour(undefined);
            }}
            returnTo={returnTo()}
            provider={provider()}
            name={connections.create.name()}
            onNameChange={connections.create.setName}
            value={connections.create.value}
            onValueChange={connections.create.setValue}
            issue={connections.create.issue}
            method={connections.create.method()}
            onMethodChange={connections.create.setMethod}
            ready={connections.create.ready()}
            onCreate={connections.create.save}
            pending={connections.pending() === "create"}
            error={
              connections.failure()?.action === "create" ? connections.failure()?.error : undefined
            }
            onRefresh={connections.refresh}
            refreshing={connections.pending() === "refresh"}
          />
        )}
      </Show>
      <ConnectionKey
        open={dialog() === "account-key"}
        onClose={() => {
          connections.dismiss();
          returnFromDetour(created());
        }}
        name={connections.connection(created() ?? "")?.name ?? ""}
        mode="setup"
        returnTo={returnTo()}
        secret={connections.key.secret()}
        onSecretChange={connections.key.setSecret}
        onSave={() => {
          const account = created();
          if (account) connections.key.save(account);
        }}
        pending={connections.pending() === "set-key"}
        error={
          connections.failure()?.action === "set-key" ? connections.failure()?.error : undefined
        }
        onRefresh={connections.refresh}
        refreshing={connections.pending() === "refresh"}
      />
      <Show when={selected()}>
        {(environment) => (
          <ConfirmRemoveEnvironment
            open={dialog() === "remove"}
            onClose={close}
            name={environment().name}
            onConfirm={() => view.remove(environment().id)}
            pending={pending("remove")}
            error={failureOf("remove")?.error}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
    </>
  );
}
