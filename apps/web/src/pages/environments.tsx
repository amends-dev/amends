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
  EnvironmentDetails,
  EnvironmentList,
  EnvironmentsPane,
  environmentsToast,
  type EnvironmentDetailsTab,
  type EnvironmentsTab,
} from "@amends/ui/screens/environments";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createMemo, createSignal } from "solid-js";
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
 * A workspace's environments: All or Needs setup by `?tab=`, with the environment open beside them
 * by `?environment=`. Adding one takes its basics, then its sandbox settings; an account it needs
 * can be created on the way, returning to the draft with that account chosen.
 */
function Environments(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const [search, setSearch] = useSearchParams<{ tab?: string; environment?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  const [detailsTab, setDetailsTab] = createSignal<EnvironmentDetailsTab>("overview");
  const [query, setQuery] = createSignal("");
  // Where the account detour returns: the draft being added, or an environment's settings.
  const [detour, setDetour] = createSignal<{ readonly environmentId?: string }>();
  const view = useEnvironments(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) {
        setDetailsTab("overview");
        setSearch({ environment: done.created });
      }
      if (done.action === "remove") setSearch({ environment: undefined });
      if (done.action === "configure") setDetailsTab("sandbox");
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
      setDetailsTab("sandbox");
      setDialog(undefined);
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
  const close = () => {
    view.dismiss();
    if (dialog() === "add") view.create.cancel();
    setDialog(undefined);
  };
  const failureOf = (action: EnvironmentAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure : undefined;
  };
  const pending = (action: EnvironmentAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const tab = (): EnvironmentsTab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const base = paths.workspacePage(workspaceId, "environments");
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
    search.environment === undefined ? undefined : view.environment(search.environment);
  const add = () => {
    view.create.begin();
    open("add");
  };
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
                needsSetup: view.environments().filter((entry) => entry.issues.length > 0).length,
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
          selectedId={selected()?.id}
          environmentHref={(id) =>
            href(
              `${base}?${new URLSearchParams({
                ...(tab() === "needs-setup" ? { tab: tab() } : {}),
                environment: id,
              })}`,
            )
          }
          onOpen={(id) => {
            view.dismiss();
            setDetailsTab("overview");
            setSearch({ environment: id });
          }}
          onAdd={view.canCreate() ? add : undefined}
          failure={view.failure()?.action === "refresh" && !dialog() ? view.failure() : undefined}
          onRefresh={view.refresh}
          refreshing={refreshing()}
        />
      </EnvironmentsPane>
      <Show when={selected()}>
        {(environment) => {
          const id = () => environment().id;
          const editor = () => view.configure.sandbox(id());
          return (
            <EnvironmentDetails
              environment={environment()}
              onClose={() => {
                view.configure.reset(id());
                view.dismiss();
                setSearch({ environment: undefined });
              }}
              tab={detailsTab()}
              onTabChange={setDetailsTab}
              name={view.rename.name(id())}
              onNameChange={(value) => view.rename.setName(id(), value)}
              nameChanged={view.rename.changed(id())}
              onSaveName={() => view.rename.save(id())}
              sandbox={
                environment().sandbox
                  ? {
                      ...editorProps(editor(), environment().sandbox!.providerId),
                      onCreateAccount: () => startDetour(id()),
                    }
                  : undefined
              }
              sandboxChanged={view.configure.changed(id())}
              onSaveSandbox={() => view.configure.save(id())}
              onDiscardSandbox={() => {
                view.configure.reset(id());
                view.dismiss();
                setDetailsTab("overview");
              }}
              onOpenAccount={() => {
                const account = environment().sandbox?.account?.id;
                if (account)
                  navigate(
                    href(
                      `${paths.workspacePage(workspaceId, "connections")}?connection=${encodeURIComponent(account)}`,
                    ),
                  );
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
