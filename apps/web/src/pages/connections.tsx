import {
  paths,
  useConnections,
  useWorkspace,
  type ConnectionAction,
  type ConnectionCapability,
  type ConnectionEntry,
} from "@amends/client";
import {
  ChooseProvider,
  ConfigureConnection,
  ConfirmRemoveConnection,
  ConfirmRemoveKey,
  ConnectionKey,
  ConnectionList,
  ConnectionPane,
  ConnectionsPane,
  connectionsToast,
  type ConnectionsTab,
} from "@amends/ui/screens/connections";
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

type Dialog = "choose" | "configure" | "key" | "remove" | "remove-key";

/** What `?add=` and `?kind=` name: any connection, or those that give one capability. */
const capabilityOf = (value: string | undefined): ConnectionCapability | undefined =>
  value === "model-access" || value === "sandboxes" ? value : undefined;

/**
 * A workspace's connections: the list, All or Needs setup by `?tab=` and one capability by
 * `?kind=`, or one connection's page by its path. `?add=` opens Add connection over either, for
 * any provider or, as the sidebar sections' + do, for `model-access` or `sandboxes`. Adding takes
 * two steps, the connection and then its key.
 */
function Connections(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const params = useParams<{ connectionId?: string }>();
  const [search, setSearch] = useSearchParams<{ tab?: string; add?: string; kind?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  // The key dialog: right after creating the connection, or adding or replacing one later.
  const [keyMode, setKeyMode] = createSignal<"setup" | "add" | "replace">("add");
  const [query, setQuery] = createSignal("");
  const base = paths.workspacePage(workspaceId, "connections");
  const view = useConnections(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) {
        navigate(paths.connection(workspaceId, done.created));
        if (done.method === "api-key") {
          setKeyMode("setup");
          setDialog("key");
          return;
        }
      }
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
  const add = () => setSearch({ add: search.kind ?? "connection" });
  const failureOf = (action: ConnectionAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure.error : undefined;
  };
  const pending = (action: ConnectionAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const tab = (): ConnectionsTab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const kind = () => capabilityOf(search.kind);
  const ofKind = createMemo(() =>
    view
      .connections()
      .filter((connection) => kind() === undefined || connection.provider?.capability === kind()),
  );
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return ofKind().filter(
      (connection) =>
        (tab() === "all" || connection.setup === "needs-setup") &&
        (words === "" ||
          connection.name.toLocaleLowerCase().includes(words) ||
          (connection.provider?.name ?? connection.providerId).toLocaleLowerCase().includes(words)),
    );
  });
  /** The providers Add connection offers: all, or those giving the capability asked for. */
  const providers = () => {
    const wanted = capabilityOf(search.add);
    return view
      .providers()
      .filter((provider) => wanted === undefined || provider.capability === wanted);
  };
  const selected = (): ConnectionEntry | undefined =>
    params.connectionId === undefined ? undefined : view.connection(params.connectionId);
  const listHref = (next: ConnectionsTab) => {
    const query = new URLSearchParams({
      ...(next === "needs-setup" ? { tab: next } : {}),
      ...(kind() ? { kind: kind()! } : {}),
    }).toString();
    return href(query ? `${base}?${query}` : base);
  };
  return (
    <>
      <Show
        when={params.connectionId}
        keyed
        fallback={
          <ConnectionsPane
            workspaceName={name()}
            tab={tab()}
            tabHref={listHref}
            onTabChange={(next) =>
              setSearch({ tab: next === "needs-setup" ? "needs-setup" : undefined })
            }
            counts={
              view.status()
                ? undefined
                : {
                    all: ofKind().length,
                    needsSetup: ofKind().filter((connection) => connection.setup === "needs-setup")
                      .length,
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
              total={ofKind().length}
              providers={view.providers().map((provider) => provider.name)}
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
            onSetKey={() => {
              setKeyMode(selected()?.keySaved ? "replace" : "add");
              open("key");
            }}
            onRemoveKey={() => open("remove-key")}
            onRemove={() => open("remove")}
            pending={view.pending()}
            failure={dialog() ? undefined : view.failure()}
            onRefresh={view.refresh}
          />
        )}
      </Show>
      <ChooseProvider
        open={dialog() === "choose"}
        onClose={close}
        workspaceName={name()}
        providers={providers()}
        onChoose={(providerId) => {
          view.create.begin(providerId);
          setDialog("configure");
        }}
      />
      <Show when={view.create.provider()}>
        {(provider) => (
          <ConfigureConnection
            open={dialog() === "configure"}
            onClose={close}
            onBack={() => {
              view.dismiss();
              setDialog("choose");
            }}
            provider={provider()}
            name={view.create.name()}
            onNameChange={view.create.setName}
            value={view.create.value}
            onValueChange={view.create.setValue}
            issue={view.create.issue}
            method={view.create.method()}
            onMethodChange={view.create.setMethod}
            ready={view.create.ready()}
            onCreate={view.create.save}
            pending={pending("create")}
            error={failureOf("create")}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
      <Show when={selected()}>
        {(connection) => (
          <>
            <ConnectionKey
              open={dialog() === "key"}
              onClose={close}
              name={connection().name}
              mode={keyMode()}
              secret={view.key.secret()}
              onSecretChange={view.key.setSecret}
              onSave={() => view.key.save(connection().id)}
              pending={pending("set-key")}
              error={failureOf("set-key")}
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
            <ConfirmRemoveKey
              open={dialog() === "remove-key"}
              onClose={close}
              name={connection().name}
              onConfirm={() => view.key.clear(connection().id)}
              pending={pending("clear-key")}
              error={failureOf("clear-key")}
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
            <ConfirmRemoveConnection
              open={dialog() === "remove"}
              onClose={close}
              name={connection().name}
              keySaved={connection().keySaved}
              onConfirm={() => view.remove(connection().id)}
              pending={pending("remove")}
              error={failureOf("remove")}
              onRefresh={view.refresh}
              refreshing={refreshing()}
            />
          </>
        )}
      </Show>
    </>
  );
}
