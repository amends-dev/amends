import {
  paths,
  useAgents,
  useConnections,
  useTurnActivity,
  useWorkspace,
  type AgentAction,
  type AgentEntry,
  type ConfigurationEditor,
} from "@amends/client";
import {
  AddAgent,
  AgentDetails,
  AgentList,
  AgentsPane,
  ConfirmRemoveAgent,
  agentsToast,
  type AgentDetailsTab,
  type AgentsTab,
} from "@amends/ui/screens/agents";
import { ChooseProvider, ConfigureConnection, ConnectionKey } from "@amends/ui/screens/connections";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { Show, createMemo, createSignal } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => `#${path}`;

export function AgentsPage() {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Show when={params.workspaceId} keyed>
      {(workspaceId) => <Agents workspaceId={workspaceId} />}
    </Show>
  );
}

type Dialog = "add" | "remove" | "choose-provider" | "create-connection" | "connection-key";

/**
 * A workspace's agents: All or Needs setup by `?tab=`, with the agent open beside them by
 * `?agent=`. Adding one takes its name, role, model access, environment, and instructions; a model
 * connection it needs can be created on the way, returning to the draft with it chosen.
 */
function Agents(props: { readonly workspaceId: string }) {
  const { workspaceId } = props;
  const [search, setSearch] = useSearchParams<{ tab?: string; agent?: string }>();
  const navigate = useNavigate();
  const workspace = useWorkspace(() => workspaceId);
  const actions = useWorkspaceActions();
  const [dialog, setDialog] = createSignal<Dialog>();
  const [detailsTab, setDetailsTab] = createSignal<AgentDetailsTab>("overview");
  const [query, setQuery] = createSignal("");
  // Where the connection detour returns: the draft being added, or an agent's configuration.
  const [detour, setDetour] = createSignal<{ readonly agentId?: string }>();
  const view = useAgents(workspaceId, {
    selected: () => search.agent,
    done: (done) => {
      if (done.action === "create" && done.created) {
        setDetailsTab("overview");
        setSearch({ agent: done.created });
      }
      if (done.action === "remove") setSearch({ agent: undefined });
      actions.toast(agentsToast(done.action, done.subject));
      setDialog(undefined);
    },
  });
  /** Back from the connection detour, with the connection it created chosen. */
  const returnFromDetour = (connectionId: string | undefined) => {
    const from = detour();
    setDetour(undefined);
    if (from?.agentId !== undefined) {
      if (connectionId) view.configure.configuration(from.agentId).setConnection(connectionId);
      setDetailsTab("configuration");
      setDialog(undefined);
    } else {
      if (connectionId) view.create.configuration.setConnection(connectionId);
      setDialog(view.create.active() ? "add" : undefined);
    }
  };
  // The connection the detour created, kept while its key is asked for.
  const [created, setCreated] = createSignal<string>();
  const connections = useConnections(workspaceId, {
    done: (done) => {
      if (done.action === "create" && done.created) {
        setCreated(done.created);
        if (done.method === "api-key") {
          setDialog("connection-key");
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
  const modelProviders = () =>
    connections.providers().filter((provider) => provider.capability === "model-access");
  /** Create a model connection for the agent open, or for the draft, starting one if needed. */
  const startDetour = (agentId?: string) => {
    view.dismiss();
    if (agentId === undefined && !view.create.active()) view.create.begin();
    setDetour(agentId === undefined ? {} : { agentId });
    setDialog("choose-provider");
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
  const failureOf = (action: AgentAction) => {
    const failure = view.failure();
    return failure?.action === action ? failure : undefined;
  };
  const refreshing = () => view.pending() === "refresh";
  const name = () => workspace()?.workspace.name ?? "";
  const tab = (): AgentsTab => (search.tab === "needs-setup" ? "needs-setup" : "all");
  const base = paths.workspacePage(workspaceId, "agents");
  const activity = useTurnActivity(workspaceId);
  const shown = createMemo(() => {
    const words = query().trim().toLocaleLowerCase();
    return view
      .agents()
      .filter(
        (agent) =>
          (tab() === "all" || agent.issues.length > 0) &&
          (words === "" || agent.name.toLocaleLowerCase().includes(words)),
      )
      .map((agent) => ({ ...agent, activity: activity.agentActivity(agent.memberId) }));
  });
  const selected = (): AgentEntry | undefined =>
    search.agent === undefined ? undefined : view.agent(search.agent);
  const add = () => {
    view.create.begin();
    open("add");
  };
  /** The draft's name, or the agent's, for the detour to name where it returns. */
  const returnTo = () => {
    const from = detour();
    return from?.agentId === undefined
      ? view.create.name().trim() || "New agent"
      : (view.agent(from.agentId)?.name ?? "your agent");
  };
  const editorProps = (editor: ConfigurationEditor) => ({
    instructions: editor.draft().instructions,
    onInstructionsChange: editor.setInstructions,
    connections: view.connections(),
    connectionId: editor.draft().connectionId,
    onConnectionChange: editor.setConnection,
    model: editor.draft().model,
    onModelChange: editor.setModel,
    environments: editor.environments(),
    environmentId: editor.draft().environmentId,
    onEnvironmentChange: editor.setEnvironment,
    reasoning: editor.draft().reasoning,
    onReasoningChange: editor.setReasoning,
  });
  const leaveDetour = () => {
    connections.create.cancel();
    returnFromDetour(undefined);
  };
  return (
    <>
      <AgentsPane
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
                all: view.agents().length,
                needsSetup: view.agents().filter((agent) => agent.issues.length > 0).length,
              }
        }
        onAdd={view.canCreate() ? add : undefined}
        status={view.status()}
        onRetry={view.refresh}
      >
        <AgentList
          tab={tab()}
          query={query()}
          onQueryChange={setQuery}
          agents={shown()}
          total={view.agents().length}
          noModelConnection={view.connectionsLoaded() && view.connections().length === 0}
          selectedId={selected()?.id}
          agentHref={(id) =>
            href(
              `${base}?${new URLSearchParams({
                ...(tab() === "needs-setup" ? { tab: tab() } : {}),
                agent: id,
              })}`,
            )
          }
          onOpen={(id) => {
            view.dismiss();
            setDetailsTab("overview");
            setSearch({ agent: id });
          }}
          onAdd={view.canCreate() ? add : undefined}
          onCreateConnection={view.canCreate() ? () => startDetour() : undefined}
          failure={view.failure()?.action === "refresh" && !dialog() ? view.failure() : undefined}
          onRefresh={view.refresh}
          refreshing={refreshing()}
        />
      </AgentsPane>
      <Show when={selected()}>
        {(agent) => {
          const id = () => agent().id;
          return (
            <AgentDetails
              agent={agent()}
              onClose={() => {
                view.configure.reset(id());
                view.dismiss();
                setSearch({ agent: undefined });
              }}
              tab={detailsTab()}
              onTabChange={setDetailsTab}
              name={view.rename.name(id())}
              onNameChange={(value) => view.rename.setName(id(), value)}
              nameChanged={view.rename.changed(id())}
              onSaveName={() => view.rename.save(id())}
              connectionReady={
                view.connections().find((connection) => connection.id === agent().connection.id)
                  ?.ready
              }
              configuration={{
                ...editorProps(view.configure.configuration(id())),
                onCreateConnection: () => startDetour(id()),
              }}
              configurationChanged={view.configure.changed(id())}
              onSaveConfiguration={() => view.configure.save(id())}
              onDiscardConfiguration={() => {
                view.configure.reset(id());
                view.dismiss();
                setDetailsTab("overview");
              }}
              onOpenConnection={() =>
                navigate(
                  href(
                    `${paths.workspacePage(workspaceId, "connections")}?connection=${encodeURIComponent(agent().connection.id)}`,
                  ),
                )
              }
              onOpenEnvironment={() =>
                navigate(
                  href(
                    `${paths.workspacePage(workspaceId, "environments")}?environment=${encodeURIComponent(agent().environment.id)}`,
                  ),
                )
              }
              onRemove={() => open("remove")}
              pending={view.pending()}
              failure={dialog() ? undefined : view.failure()}
              onRefresh={view.refresh}
            />
          );
        }}
      </Show>
      <AddAgent
        open={dialog() === "add"}
        onClose={close}
        workspaceName={name()}
        name={view.create.name()}
        onNameChange={view.create.setName}
        roles={view.roles()}
        roleId={view.create.roleId()}
        onRoleChange={view.create.setRole}
        configuration={{
          ...editorProps(view.create.configuration),
          onCreateConnection: () => startDetour(),
        }}
        ready={view.create.ready()}
        onCreate={view.create.save}
        pending={view.pending() === "create"}
        error={failureOf("create")?.error}
        problems={failureOf("create")?.problems}
        onRefresh={view.refresh}
        refreshing={refreshing()}
      />
      <ChooseProvider
        open={dialog() === "choose-provider"}
        onClose={() => returnFromDetour(undefined)}
        workspaceName={name()}
        providers={modelProviders()}
        returnTo={returnTo()}
        onChoose={(providerId) => {
          connections.create.begin(providerId);
          setDialog("create-connection");
        }}
      />
      <Show when={connections.create.provider()}>
        {(provider) => (
          <ConfigureConnection
            open={dialog() === "create-connection"}
            onClose={leaveDetour}
            onBack={() => {
              connections.create.cancel();
              setDialog("choose-provider");
            }}
            returnTo={returnTo()}
            returnKind="agent"
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
        open={dialog() === "connection-key"}
        onClose={() => {
          connections.dismiss();
          returnFromDetour(created());
        }}
        name={connections.connection(created() ?? "")?.name ?? ""}
        mode="setup"
        returnTo={returnTo()}
        returnKind="agent"
        secret={connections.key.secret()}
        onSecretChange={connections.key.setSecret}
        onSave={() => {
          const connection = created();
          if (connection) connections.key.save(connection);
        }}
        pending={connections.pending() === "set-key"}
        error={
          connections.failure()?.action === "set-key" ? connections.failure()?.error : undefined
        }
        onRefresh={connections.refresh}
        refreshing={connections.pending() === "refresh"}
      />
      <Show when={selected()}>
        {(agent) => (
          <ConfirmRemoveAgent
            open={dialog() === "remove"}
            onClose={close}
            name={agent().name}
            workspaceName={name()}
            onConfirm={() => view.remove(agent().id)}
            pending={view.pending() === "remove"}
            error={failureOf("remove")?.error}
            onRefresh={view.refresh}
            refreshing={refreshing()}
          />
        )}
      </Show>
    </>
  );
}
