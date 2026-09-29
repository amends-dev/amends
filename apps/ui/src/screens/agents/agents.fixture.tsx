// Workshop harness: Agents with the Lunacy sample agents, model connections, and environments,
// following the mocks' behavior notes over local state. Not exported.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Toast } from "../../components/toast/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import {
  ChooseProvider,
  ConfigureConnection,
  ConnectionKey,
  type ConnectionMethod,
  type ConnectionProviderOption,
} from "../connections/index.ts";
import { navigation } from "../sample.ts";
import { DestinationSidebar, WorkspaceNavigation } from "../workspace-navigation/index.ts";
import {
  agentStatus,
  AddAgent,
  AgentList,
  AgentPane,
  AgentsPane,
  ConfirmRemoveAgent,
  agentsToast,
  type AgentTab,
  type AgentEnvironmentOption,
  type AgentIssue,
  type AgentProblem,
  type AgentSummary,
  type AgentsTab,
  type EnvironmentFit,
  type ModelConnectionOption,
} from "./index.ts";

const claude = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
];
const sampleConnections: readonly ModelConnectionOption[] = [
  { id: "team", name: "Anthropic · Team", ready: true, models: claude },
  { id: "backup", name: "Anthropic · Backup", ready: false, models: claude },
  { id: "openrouter", name: "OpenRouter · Shared", ready: true, models: [] },
];
const sampleEnvironments = [
  { id: "in-process", name: "In-process", provider: undefined, pending: false },
  { id: "local", name: "Local development", provider: "Local directory", pending: false },
  { id: "remote", name: "Remote development", provider: "Daytona", pending: false },
  { id: "review", name: "Review sandbox", provider: "Daytona", pending: true },
] as const;
const modelProviders: readonly ConnectionProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models through the Anthropic API.",
    capability: "model-access",
    methods: ["api-key"],
    settings: [
      {
        key: "apiUrl",
        label: "API URL",
        kind: "url",
        required: false,
        description: "Leave empty to use Anthropic’s API.",
        placeholder: "https://api.anthropic.com",
      },
    ],
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    description: "OpenAI, OpenRouter, or a compatible API.",
    capability: "model-access",
    methods: ["api-key", "none"],
    settings: [
      {
        key: "baseUrl",
        label: "Base URL",
        kind: "url",
        required: true,
        placeholder: "https://api.openai.com/v1",
      },
    ],
  },
];

interface Draft {
  readonly instructions: string;
  readonly connectionId: string | undefined;
  readonly model: string;
  readonly reasoning: string | undefined;
  readonly environmentId: string | undefined;
}
interface Sample extends Draft {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

const instructions =
  "Help the team investigate issues and deliver small, reviewed changes.\n\nExplain your approach, ask when requirements are unclear, and summarize what changed.";
const samples: readonly Sample[] = [
  {
    id: "atlas",
    name: "Atlas",
    role: "Member",
    instructions,
    connectionId: "team",
    model: "claude-sonnet-5",
    reasoning: undefined,
    environmentId: "remote",
  },
  {
    id: "nora",
    name: "Nora",
    role: "Member",
    instructions,
    connectionId: "team",
    model: "claude-haiku-4-5-20251001",
    reasoning: undefined,
    environmentId: "in-process",
  },
  {
    id: "review-helper",
    name: "Review helper",
    role: "Member",
    instructions,
    connectionId: "backup",
    model: "claude-sonnet-5",
    reasoning: undefined,
    environmentId: "remote",
  },
  {
    id: "yumi",
    name: "Yumi",
    role: "Member",
    instructions,
    connectionId: "team",
    model: "claude-opus-5-5",
    reasoning: undefined,
    environmentId: "local",
  },
];

/** Where agents are at work: Atlas waits in one thread, Yumi works in two. */
const activities: Readonly<Record<string, AgentSummary["activity"]>> = {
  atlas: { state: "queued", places: ["#design"] },
  yumi: { state: "working", places: ["#general", "#product"] },
};
const turnsOf = (id: string) => {
  const activity = activities[id];
  return (activity?.places ?? []).map((where, index) => ({
    id: `${id}-turn-${index}`,
    state: activity!.state,
    where,
  }));
};

type Dialog = "add" | "remove" | "choose-provider" | "configure-connection" | "connection-key";

export interface AgentsWorkspaceProps {
  readonly tab?: AgentsTab;
  /** The agent whose page shows, in place of the list. */
  readonly selected?: string;
  readonly agentTab?: AgentTab;
  readonly dialog?: Dialog;
  /** For the add dialog: a name typed, and the connection chosen. */
  readonly add?: { readonly name?: string; readonly connectionId?: string };
  readonly status?: "loading" | "failed";
  /** No agents yet; with `noConnections`, no model connection either. */
  readonly noAgents?: boolean;
  readonly noConnections?: boolean;
  /** A member who may only look. */
  readonly readOnly?: boolean;
  /** An administrator who is not the owner, and so gives new agents only Member. */
  readonly administrator?: boolean;
  /** The first save of a configuration finds its connection no longer available. */
  readonly connectionGone?: boolean;
  /** One saved agent holds a reasoning level its harness does not take. */
  readonly staleReasoning?: boolean;
}

/** The Agents rules over local state: adding, the model-connection detour, and toasts. */
export function AgentsWorkspace(props: AgentsWorkspaceProps) {
  const [records, setRecords] = createSignal<readonly Sample[]>(
    props.noAgents
      ? []
      : props.staleReasoning
        ? samples.map((sample) =>
            sample.id === "atlas" ? { ...sample, reasoning: "high" } : sample,
          )
        : samples,
  );
  const [connections, setConnections] = createSignal(props.noConnections ? [] : sampleConnections);
  const [tab, setTab] = createSignal<AgentsTab>(props.tab ?? "all");
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(props.selected);
  const [agentTab, setAgentTab] = createSignal<AgentTab>(props.agentTab ?? "overview");
  const [dialog, setDialog] = createSignal<Dialog | undefined>(props.dialog);
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({});
  const [configs, setConfigs] = createSignal<Readonly<Record<string, Draft>>>({});
  const [problems, setProblems] = createSignal<readonly AgentProblem[]>([]);
  const [connectionGone, setConnectionGone] = createSignal(props.connectionGone ?? false);
  const firstConnection = () => connections().find((connection) => connection.ready);
  const [adding, setAdding] = createSignal({
    name: props.add?.name ?? "",
    roleId: "member",
    instructions: "",
    connectionId: props.add?.connectionId ?? firstConnection()?.id,
    model:
      connections().find((connection) => connection.id === (props.add?.connectionId ?? "team"))
        ?.models[1]?.id ?? "",
    reasoning: undefined as string | undefined,
    environmentId: "remote" as string | undefined,
  });
  const [provider, setProvider] = createSignal<ConnectionProviderOption>(modelProviders[0]!);
  const [connection, setConnection] = createSignal({ name: "Anthropic · Agents", url: "" });
  const [method, setMethod] = createSignal<ConnectionMethod>("api-key");
  const [secret, setSecret] = createSignal("");
  // Where the connection detour returns: the add dialog, or an agent's configuration by ID.
  const [returnTo, setReturnTo] = createSignal<string>("add");
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);

  const connectionOf = (id: string | undefined) =>
    connections().find((candidate) => candidate.id === id);
  const fitOf = (
    draft: Draft,
    environment: (typeof sampleEnvironments)[number],
  ): EnvironmentFit => {
    const ready = connectionOf(draft.connectionId)?.ready ?? true;
    if (draft.reasoning !== undefined)
      return { kind: "cant-run", reasons: ["reasoning-unsupported"] };
    if (environment.pending)
      return { kind: "needs-setup", issues: ["connection-incomplete"], connection: !ready };
    return ready ? { kind: "works" } : { kind: "needs-setup", issues: [], connection: true };
  };
  const environmentsFor = (draft: Draft): readonly AgentEnvironmentOption[] =>
    sampleEnvironments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      runtime: `Amends · ${environment.provider ?? "No sandbox"}`,
      harness: "Amends",
      provider: environment.provider,
      reasoningLevels: [],
      fit: fitOf(draft, environment),
    }));
  const issuesOf = (record: Sample): readonly AgentIssue[] => {
    const issues: AgentIssue[] = [];
    const chosen = connectionOf(record.connectionId);
    if (!chosen) issues.push("connection-unavailable");
    else if (!chosen.ready) issues.push("connection-not-ready");
    if (sampleEnvironments.find((environment) => environment.id === record.environmentId)?.pending)
      issues.push("environment-not-ready");
    if (record.reasoning !== undefined) issues.push("reasoning-unsupported");
    return issues;
  };
  const summaryOf = (record: Sample): AgentSummary => {
    const environment = sampleEnvironments.find((option) => option.id === record.environmentId);
    return {
      id: record.id,
      name: record.name,
      role: record.role,
      instructions: record.instructions,
      connection: { id: record.connectionId ?? "", name: connectionOf(record.connectionId)?.name },
      model: record.model,
      reasoning: record.reasoning,
      environment: {
        id: record.environmentId ?? "",
        name: environment?.name,
        runtime: environment && `Amends · ${environment.provider ?? "No sandbox"}`,
      },
      issues: issuesOf(record),
      configurable: !props.readOnly,
      removable: !props.readOnly,
      createdBy: "Jamie Morgan",
      createdAt: new Date(2026, 8, 28),
      activity: activities[record.id],
    };
  };
  const all = createMemo(() => records().map(summaryOf));
  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return all().filter(
      (agent) =>
        (tab() === "all" || agent.issues.length > 0) &&
        (!words || agent.name.toLowerCase().includes(words)),
    );
  });
  const current = () => all().find((agent) => agent.id === selected());
  const record = (id: string) => records().find((entry) => entry.id === id);
  const configOf = (id: string): Draft => configs()[id] ?? record(id)!;

  /** Edits to a draft, whichever form holds it. */
  const editor = (draft: () => Draft, change: (next: Draft) => void) => ({
    instructions: draft().instructions,
    onInstructionsChange: (text: string) => change({ ...draft(), instructions: text }),
    connections: connections(),
    connectionId: draft().connectionId,
    onConnectionChange: (connectionId: string) => change({ ...draft(), connectionId }),
    model: draft().model,
    onModelChange: (model: string) => change({ ...draft(), model }),
    environments: environmentsFor(draft()),
    environmentId: draft().environmentId,
    onEnvironmentChange: (environmentId: string) => change({ ...draft(), environmentId }),
    reasoning: draft().reasoning,
    onReasoningChange: (reasoning: string | undefined) => change({ ...draft(), reasoning }),
  });
  const complete = (draft: Draft) =>
    connectionOf(draft.connectionId) !== undefined &&
    draft.model.trim() !== "" &&
    draft.environmentId !== undefined &&
    environmentsFor(draft).find((option) => option.id === draft.environmentId)?.fit?.kind !==
      "cant-run";
  const saved = (draft: Draft) =>
    JSON.stringify([
      draft.instructions.trim(),
      draft.connectionId,
      draft.model.trim(),
      draft.reasoning,
      draft.environmentId,
    ]);
  const startDetour = (from: string) => {
    setReturnTo(from);
    setConnection({ name: "Anthropic · Agents", url: "" });
    setSecret("");
    setDialog("choose-provider");
  };
  const returnName = () =>
    returnTo() === "add" ? adding().name.trim() || "New agent" : (current()?.name ?? "");
  const back = () => setDialog(returnTo() === "add" ? "add" : undefined);
  const finishDetour = (keySaved: boolean) => {
    const created: ModelConnectionOption = {
      id: `connection-${connections().length + 1}`,
      name: connection().name,
      ready: keySaved || method() === "none",
      models: provider().id === "anthropic" ? claude : [],
    };
    setConnections([...connections(), created]);
    const target = returnTo();
    if (target === "add") setAdding({ ...adding(), connectionId: created.id });
    else setConfigs({ ...configs(), [target]: { ...configOf(target), connectionId: created.id } });
    back();
    if (keySaved) toast("API key saved");
  };
  const nav = navigation({ groups: [{ id: "general", name: "general" }] });
  const roles = () =>
    props.administrator
      ? [{ id: "member", name: "Member" }]
      : [
          { id: "member", name: "Member" },
          { id: "administrator", name: "Administrator" },
        ];
  const open = (id: string | undefined) => {
    setProblems([]);
    setAgentTab("overview");
    setSelected(id);
  };
  const add = props.readOnly ? undefined : () => setDialog("add");
  // The sidebar's and list's links are plain hashes here: follow the list and each agent's page.
  onMount(() => {
    const follow = () => {
      const target = window.location.hash.slice(1);
      if (target === "agents") return open(undefined);
      if (!target.startsWith("agent-")) return;
      const rest = target.slice("agent-".length);
      const tab = rest.endsWith("-configuration") ? "configuration" : "overview";
      const id = rest.replace(/-(configuration|overview)$/, "");
      if (!records().some((entry) => entry.id === id)) return;
      if (id !== selected()) open(id);
      setAgentTab(tab);
    };
    window.addEventListener("hashchange", follow);
    onCleanup(() => window.removeEventListener("hashchange", follow));
  });
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} destination="agents">
        <DestinationSidebar
          sections={[
            {
              id: "agents",
              title: "Agents",
              href: "#agents",
              current: !props.status && selected() === undefined,
              browse: { label: "Browse agents", onBrowse: () => open(undefined) },
              create: add && { label: "Add agent", onCreate: add },
              entries: props.status
                ? []
                : all().map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                    href: `#agent-${agent.id}`,
                    current: selected() === agent.id,
                    person: { name: agent.name, initials: agent.name.charAt(0), tone: "lilac" },
                    activity: agent.activity?.state,
                    status: agentStatus(agent.issues, agent.activity),
                  })),
              loading: props.status === "loading",
              empty: "No agents yet",
            },
          ]}
        />
      </WorkspaceNavigation>
      <Shell.Main>
        <Show
          when={!props.status && current()}
          fallback={
            <AgentsPane
              workspaceName="Mercier & Co"
              tab={tab()}
              tabHref={(next) => `#${next}`}
              onTabChange={(next) => {
                setQuery("");
                setTab(next);
              }}
              counts={
                props.status
                  ? undefined
                  : {
                      all: all().length,
                      needsSetup: all().filter((agent) => agent.issues.length > 0).length,
                    }
              }
              onAdd={add}
              status={props.status}
              onRetry={() => {}}
            >
              <AgentList
                tab={tab()}
                query={query()}
                onQueryChange={setQuery}
                agents={shown()}
                total={all().length}
                noModelConnection={connections().length === 0}
                agentHref={(id) => `#agent-${id}`}
                onAdd={add}
                onCreateConnection={props.readOnly ? undefined : () => startDetour("add")}
              />
            </AgentsPane>
          }
        >
          {(agent) => {
            const id = () => agent().id;
            const changed = () =>
              configs()[id()] !== undefined &&
              saved(configOf(id())) !== saved(record(id())!) &&
              complete(configOf(id()));
            return (
              <AgentPane
                workspaceName="Mercier & Co"
                agent={agent()}
                onBrowse={() => open(undefined)}
                tab={agentTab()}
                tabHref={(next) => `#agent-${id()}-${next}`}
                onTabChange={setAgentTab}
                name={names()[id()] ?? agent().name}
                onNameChange={(name) => setNames({ ...names(), [id()]: name })}
                nameChanged={
                  names()[id()] !== undefined &&
                  names()[id()]!.trim() !== "" &&
                  names()[id()]!.trim() !== agent().name
                }
                onSaveName={() => {
                  const name = names()[id()]!.trim();
                  setRecords(
                    records().map((entry) => (entry.id === id() ? { ...entry, name } : entry)),
                  );
                  const { [id()]: _saved, ...rest } = names();
                  setNames(rest);
                  toast(agentsToast("rename"));
                }}
                connectionReady={connectionOf(agent().connection.id)?.ready}
                configuration={{
                  ...editor(
                    () => configOf(id()),
                    (next) => setConfigs({ ...configs(), [id()]: next }),
                  ),
                  onCreateConnection: () => startDetour(id()),
                }}
                configurationChanged={changed()}
                onSaveConfiguration={() => {
                  if (connectionGone()) {
                    setConnectionGone(false);
                    setProblems([{ kind: "connection-unavailable" }]);
                    return;
                  }
                  setProblems([]);
                  const next = configOf(id());
                  setRecords(
                    records().map((entry) => (entry.id === id() ? { ...entry, ...next } : entry)),
                  );
                  const { [id()]: _saved, ...rest } = configs();
                  setConfigs(rest);
                  toast(agentsToast("configure"));
                }}
                onDiscardConfiguration={() => {
                  const { [id()]: _saved, ...rest } = configs();
                  setConfigs(rest);
                  setProblems([]);
                  setAgentTab("overview");
                }}
                onOpenConnection={() => toast("Opens the connection")}
                onOpenEnvironment={() => toast("Opens the environment")}
                turns={turnsOf(id())}
                onOpenTurn={() => toast("Opens the turn log beside the page")}
                onRemove={() => setDialog("remove")}
                failure={
                  problems().length > 0
                    ? { action: "configure", error: "invalid", problems: problems() }
                    : undefined
                }
                onRefresh={() => setProblems([])}
              />
            );
          }}
        </Show>
      </Shell.Main>
      <AddAgent
        open={dialog() === "add"}
        onClose={() => setDialog(undefined)}
        workspaceName="Mercier & Co"
        name={adding().name}
        onNameChange={(name) => setAdding({ ...adding(), name })}
        roles={roles()}
        roleId={adding().roleId}
        onRoleChange={(roleId) => setAdding({ ...adding(), roleId })}
        configuration={{
          ...editor(adding, (next) => setAdding({ ...adding(), ...next })),
          onCreateConnection: () => startDetour("add"),
        }}
        ready={adding().name.trim() !== "" && complete(adding())}
        onCreate={() => {
          const created: Sample = {
            ...adding(),
            id: `agent-${records().length + 1}`,
            name: adding().name.trim(),
            role: adding().roleId === "administrator" ? "Administrator" : "Member",
          };
          setRecords([...records(), created]);
          setSelected(created.id);
          setAgentTab("overview");
          setDialog(undefined);
          toast(agentsToast("create", created.name));
        }}
      />
      <ChooseProvider
        open={dialog() === "choose-provider"}
        onClose={back}
        workspaceName="Mercier & Co"
        providers={modelProviders}
        returnTo={returnName()}
        onChoose={(providerId) => {
          const chosen = modelProviders.find((option) => option.id === providerId)!;
          setProvider(chosen);
          setMethod(chosen.methods[0]!);
          setConnection({ name: `${chosen.name} · Agents`, url: "" });
          setDialog("configure-connection");
        }}
      />
      <ConfigureConnection
        open={dialog() === "configure-connection"}
        onClose={back}
        onBack={() => setDialog("choose-provider")}
        returnTo={returnName()}
        returnKind="agent"
        provider={provider()}
        name={connection().name}
        onNameChange={(name) => setConnection({ ...connection(), name })}
        value={() => connection().url}
        onValueChange={(_key, url) => setConnection({ ...connection(), url })}
        method={method()}
        onMethodChange={setMethod}
        ready={connection().name.trim() !== ""}
        onCreate={() =>
          method() === "api-key" ? setDialog("connection-key") : finishDetour(false)
        }
      />
      <ConnectionKey
        open={dialog() === "connection-key"}
        onClose={() => finishDetour(false)}
        name={connection().name}
        mode="setup"
        returnTo={returnName()}
        returnKind="agent"
        secret={secret()}
        onSecretChange={setSecret}
        onSave={() => finishDetour(true)}
      />
      <Show when={current()}>
        {(agent) => (
          <ConfirmRemoveAgent
            open={dialog() === "remove"}
            onClose={() => setDialog(undefined)}
            name={agent().name}
            workspaceName="Mercier & Co"
            onConfirm={() => {
              const { id, name } = agent();
              setRecords(records().filter((entry) => entry.id !== id));
              setSelected(undefined);
              setDialog(undefined);
              toast(agentsToast("remove", name));
            }}
          />
        )}
      </Show>
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item
              onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}
            >
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </Shell.Root>
  );
}
