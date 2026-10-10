import { paths, useConnections, useWorkspace } from "@amends-dev/client";
import {
  ChooseIntegration,
  ConfigureConnection,
  ConfirmRemoveConnection,
  ConnectionList,
  ConnectionPane,
  ConnectionsPane,
  ReplaceKeyV2,
  connectionsToast,
  type ConnectionsAction,
  type ConnectionsTab,
  type IntegrationCapability,
} from "@amends-dev/ui/screens/connections";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => path;

export function ConnectionsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Connections workspaceId={workspaceId} />}
    </Show>
  );
}

type Dialog = "choose" | "configure" | "replace-key" | "remove";

const capabilities: readonly IntegrationCapability[] = [
  "models",
  "tools",
  "sandboxes",
  "harnesses",
  "channels",
];
/** What `?tab=` and `?add=` name: one capability, or none for all of them. */
const capabilityOf = (value: string | undefined): IntegrationCapability | undefined =>
  capabilities.find((capability) => capability === value);

/**
 * A workspace's connections: the list, all of them or one capability's by `?tab=`, or one
 * connection's page by its path. `?add=` opens Add connection over either, for any integration or,
 * as the sidebar sections' + do, for one capability's. Creating opens the connection's page, where
 * it is checked.
 */
function Connections(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const params = useParams<{ connectionId?: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string; add?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  const [query, setQuery] = createSignal("");
  const base = paths.workspacePage(workspaceId, "connections");
  const view = useConnections(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created)
        navigate(paths.connection(workspaceId, done.created));
      if (done.action === "remove") navigate(base);
      actions.toast(connectionsToast(done.action, done.subject));
      setDialog(undefined);
    },
  });
  const open = (next: Dialog) => {
    view.dismiss();
    setDialog(next);
  };
  const adding = () => dialog() === "choose" || dialog() === "configure";
  const close = () => {
    view.dismiss();
    if (adding()) return setSearch({ add: undefined });
    setDialog(undefined);
  };
  // `?add=` opens Add connection over the page; leaving it, such as with Back, sets the draft aside.
  createEffect(
    on(
      () => search.add !== undefined && view.canCreate(),
      (add) => {
        if (add) open("choose");
        else if (adding()) {
          view.create.cancel();
          setDialog(undefined);
        }
      },
    ),
  );
  const tab = (): ConnectionsTab => capabilityOf(search.tab) ?? "all";
  const add = () => setSearch({ add: capabilityOf(search.tab) ?? "connection" });
  const inTab = (provides: readonly IntegrationCapability[] | undefined, next: ConnectionsTab) =>
    next === "all" || (provides?.includes(next) ?? false);
  const ofTab = createMemo(() =>
    view.connections().filter((connection) => inTab(connection.integration?.provides, tab())),
  );
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return ofTab().filter(
      (connection) =>
        words === "" ||
        connection.name.toLocaleLowerCase().includes(words) ||
        (connection.integration?.name ?? connection.integrationId)
          .toLocaleLowerCase()
          .includes(words),
    );
  });
  const count = (next: ConnectionsTab) =>
    view.connections().filter((connection) => inTab(connection.integration?.provides, next)).length;
  /** The integrations Add connection offers: all, or those giving the capability asked for. */
  const integrations = () => {
    const wanted = capabilityOf(search.add);
    return view
      .integrations()
      .filter((integration) => wanted === undefined || integration.provides.includes(wanted));
  };
  const failureOf = (action: ConnectionsAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure : undefined;
  };
  const pending = (action: ConnectionsAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  /** What runs, as one connection's page shows it: a check of another connection is not its own. */
  const pendingOn = (connectionId: string) => {
    const running = view.pending();
    return running === "check" && !view.check.running(connectionId) ? undefined : running;
  };
  const name = () => workspace()?.workspace.name ?? "";
  const selected = () =>
    params.connectionId === undefined ? undefined : view.connection(params.connectionId);
  const tabHref = (next: ConnectionsTab) => href(next === "all" ? base : `${base}?tab=${next}`);
  return (
    <>
      <Show
        when={params.connectionId}
        keyed
        fallback={
          <ConnectionsPane
            workspaceName={name()}
            tab={tab()}
            tabHref={tabHref}
            onTabChange={(next) => {
              setQuery("");
              setSearch({ tab: next === "all" ? undefined : next });
            }}
            counts={
              view.status()
                ? undefined
                : {
                    all: count("all"),
                    models: count("models"),
                    tools: count("tools"),
                    sandboxes: count("sandboxes"),
                    harnesses: count("harnesses"),
                    channels: count("channels"),
                  }
            }
            onAdd={view.canCreate() ? add : undefined}
            status={view.status()}
            onRetry={view.refresh}
          >
            <ConnectionList
              tab={tab()}
              query={query()}
              onQueryChange={setQuery}
              connections={shown()}
              total={view.connections().length}
              connectionHref={(id) => href(paths.connection(workspaceId, id))}
              onAdd={view.canCreate() ? add : undefined}
              failure={
                view.failure()?.action === "refresh" && !dialog() ? view.failure() : undefined
              }
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          </ConnectionsPane>
        }
      >
        {(connectionId) => (
          <ConnectionPane
            workspaceName={name()}
            connection={selected()}
            status={view.status()}
            onRetry={view.refresh}
            onBrowse={() => navigate(base)}
            name={view.rename.name(connectionId)}
            onNameChange={(value) => view.rename.setName(connectionId, value)}
            nameChanged={view.rename.changed(connectionId)}
            onSaveName={() => view.rename.save(connectionId)}
            value={(key) => view.configure.value(connectionId, key)}
            onValueChange={(key, value) => view.configure.setValue(connectionId, key, value)}
            issue={(key) => view.configure.issue(connectionId, key)}
            settingsChanged={view.configure.changed(connectionId)}
            onSaveSettings={() => view.configure.save(connectionId)}
            onReplaceKey={() => open("replace-key")}
            onCheck={() => view.check.run(connectionId)}
            health={view.check.health(connectionId)}
            onRemove={() => open("remove")}
            pending={pendingOn(connectionId)}
            failure={dialog() ? undefined : (view.failure() ?? view.check.failure(connectionId))}
            onRefresh={view.refresh}
          />
        )}
      </Show>
      <ChooseIntegration
        open={dialog() === "choose"}
        onClose={close}
        workspaceName={name()}
        capability={capabilityOf(search.add)}
        integrations={integrations()}
        onChoose={(integrationId) => {
          view.create.begin(integrationId);
          setDialog("configure");
        }}
      />
      <Show when={view.create.integration()}>
        {(integration) => (
          <ConfigureConnection
            open={dialog() === "configure"}
            onClose={close}
            onBack={() => {
              view.dismiss();
              setDialog("choose");
            }}
            integration={integration()}
            name={view.create.name()}
            onNameChange={view.create.setName}
            value={view.create.value}
            onValueChange={view.create.setValue}
            issue={view.create.issue}
            auth={view.create.auth()}
            onAuthChange={view.create.setAuth}
            apiKey={view.create.apiKey()}
            onApiKeyChange={view.create.setApiKey}
            ready={view.create.ready()}
            onCreate={view.create.save}
            pending={pending("create")}
            failure={failureOf("create")}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
      <Show when={selected()}>
        {(connection) => (
          <>
            <ReplaceKeyV2
              open={dialog() === "replace-key"}
              onClose={close}
              name={connection().name}
              apiKey={view.key.apiKey()}
              onApiKeyChange={view.key.setApiKey}
              onSave={() => view.key.save(connection().id)}
              pending={pending("replace-key")}
              failure={failureOf("replace-key")}
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
            <ConfirmRemoveConnection
              open={dialog() === "remove"}
              onClose={close}
              name={connection().name}
              keySaved={connection().auth === "apiKey"}
              onConfirm={() => view.remove(connection().id)}
              pending={pending("remove")}
              failure={failureOf("remove")}
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          </>
        )}
      </Show>
    </>
  );
}
