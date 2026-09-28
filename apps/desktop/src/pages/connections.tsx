import {
  paths,
  useConnections,
  useWorkspace,
  type ConnectionAction,
  type ConnectionEntry,
} from "@amends/client";
import {
  ChooseProvider,
  ConfigureConnection,
  ConfirmRemoveConnection,
  ConfirmRemoveKey,
  ConnectionDetails,
  ConnectionKey,
  ConnectionList,
  ConnectionsPane,
  connectionsToast,
  type ConnectionsTab,
} from "@amends/ui/screens/connections";
import { useParams, useSearchParams } from "@solidjs/router";
import { Show, createMemo, createSignal } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => `#${path}`;

export function ConnectionsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Connections workspaceId={workspaceId} />}
    </Show>
  );
}

type Dialog = "choose" | "configure" | "key" | "remove" | "remove-key";

/**
 * A workspace's connections: All or Needs setup by `?tab=`, with the connection open beside them
 * by `?connection=`. Adding one takes two steps, the connection and then its key.
 */
function Connections(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const [search, setSearch] = useSearchParams<{ tab?: string; connection?: string }>();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  // The key dialog: right after creating the connection, or adding or replacing one later.
  const [keyMode, setKeyMode] = createSignal<"setup" | "add" | "replace">("add");
  const [query, setQuery] = createSignal("");
  const view = useConnections(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) {
        setSearch({ connection: done.created });
        if (done.method === "api-key") {
          setKeyMode("setup");
          setDialog("key");
          return;
        }
      }
      if (done.action === "remove") setSearch({ connection: undefined });
      actions.toast(connectionsToast(done.action, done.subject));
      setDialog(undefined);
    },
  });
  const open = (next: Dialog) => {
    view.dismiss();
    setDialog(next);
  };
  const close = () => {
    view.dismiss();
    if (dialog() === "configure") view.create.cancel();
    setDialog(undefined);
  };
  const failureOf = (action: ConnectionAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure.error : undefined;
  };
  const pending = (action: ConnectionAction) => view.pending() === action;
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const tab = (): ConnectionsTab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const base = paths.workspacePage(workspaceId, "connections");
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return view
      .connections()
      .filter(
        (connection) =>
          (tab() === "all" || connection.setup === "needs-setup") &&
          (words === "" ||
            connection.name.toLocaleLowerCase().includes(words) ||
            (connection.provider?.name ?? connection.providerId)
              .toLocaleLowerCase()
              .includes(words)),
      );
  });
  const selected = (): ConnectionEntry | undefined =>
    search.connection === undefined ? undefined : view.connection(search.connection);
  const add = () => open("choose");
  return (
    <>
      <ConnectionsPane
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
                all: view.connections().length,
                needsSetup: view
                  .connections()
                  .filter((connection) => connection.setup === "needs-setup").length,
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
          providers={view.providers().map((provider) => provider.name)}
          selectedId={selected()?.id}
          connectionHref={(id) =>
            href(
              `${base}?${new URLSearchParams({ ...(tab() === "needs-setup" ? { tab: tab() } : {}), connection: id })}`,
            )
          }
          onOpen={(id) => {
            view.dismiss();
            setSearch({ connection: id });
          }}
          onAdd={view.canCreate() ? add : undefined}
          failure={view.failure()?.action === "refresh" && !dialog() ? view.failure() : undefined}
          onRefresh={view.refresh}
          refreshing={refreshing()}
        />
      </ConnectionsPane>
      <Show when={selected()}>
        {(connection) => (
          <ConnectionDetails
            workspaceName={name()}
            connection={connection()}
            onClose={() => {
              view.configure.reset(connection().id);
              view.dismiss();
              setSearch({ connection: undefined });
            }}
            name={view.rename.name(connection().id)}
            onNameChange={(value) => view.rename.setName(connection().id, value)}
            nameChanged={view.rename.changed(connection().id)}
            onSaveName={() => view.rename.save(connection().id)}
            value={(key) => view.configure.value(connection().id, key)}
            onValueChange={(key, value) => view.configure.setValue(connection().id, key, value)}
            issue={(key) => view.configure.issue(connection().id, key)}
            settingsChanged={view.configure.changed(connection().id)}
            onSaveSettings={() => view.configure.save(connection().id)}
            onSetKey={() => {
              setKeyMode(connection().keySaved ? "replace" : "add");
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
        providers={view.providers()}
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
