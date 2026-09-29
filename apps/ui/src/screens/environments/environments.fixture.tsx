// Workshop harness: Environments with the Lunacy sample environments, harness, providers, and
// Daytona accounts, following the mocks' behavior notes over local state. Not exported.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { IconMarkEnvironments } from "@amends/icons";
import { Toast } from "../../components/toast/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { ConfigureConnection, ConnectionKey } from "../connections/index.ts";
import { navigation } from "../sample.ts";
import { DestinationSidebar, WorkspaceNavigation } from "../workspace-navigation/index.ts";
import {
  environmentStatus,
  AddEnvironment,
  ConfirmRemoveEnvironment,
  EnvironmentPane,
  EnvironmentList,
  EnvironmentsPane,
  environmentsToast,
  type CommandRowView,
  type EnvironmentTab,
  type EnvironmentIssue,
  type EnvironmentProblem,
  type EnvironmentSummary,
  type EnvironmentsTab,
  type HarnessOption,
  type Retention,
  type SandboxAccountOption,
  type SandboxProviderOption,
  type VariableRowView,
} from "./index.ts";

const harnesses: readonly HarnessOption[] = [
  {
    id: "amends",
    name: "Amends",
    description: "Amends's own agent loop, over the model a connection provides.",
    placements: ["in-process"],
  },
];
export const sampleProviders: readonly SandboxProviderOption[] = [
  {
    id: "local",
    name: "Local directory",
    description: "Runs on this host without isolation.",
    account: false,
    template: undefined,
  },
  {
    id: "daytona",
    name: "Daytona",
    description: "Isolated containers in your Daytona account.",
    account: true,
    template: {
      label: "Snapshot",
      description: "Starting snapshot for new sandboxes. Leave empty for Daytona’s default.",
    },
  },
];

interface SandboxDraft {
  readonly accountId: string | undefined;
  readonly template: string;
  readonly variables: readonly VariableRowView[];
  readonly commands: readonly CommandRowView[];
  readonly retention: Retention;
}
interface Sample {
  readonly id: string;
  readonly name: string;
  readonly providerId: string | undefined;
  readonly sandbox: SandboxDraft;
  readonly createdBy: string | undefined;
}

let rowId = 0;
const variable = (key: string, value: string): VariableRowView => ({
  id: `v${++rowId}`,
  key,
  value,
});
const command = (text: string): CommandRowView => ({ id: `c${++rowId}`, command: text });
const sandbox = (accountId: string | undefined, template = ""): SandboxDraft => ({
  accountId,
  template,
  variables: [variable("NODE_ENV", "development"), variable("LOG_LEVEL", "info")],
  commands: [command("mkdir -p .cache"), command("bun install")],
  retention: "stop",
});
const empty = (): SandboxDraft => ({
  accountId: undefined,
  template: "",
  variables: [],
  commands: [],
  retention: "stop",
});
const samples: readonly Sample[] = [
  {
    id: "in-process",
    name: "In-process",
    providerId: undefined,
    sandbox: empty(),
    createdBy: undefined,
  },
  {
    id: "local",
    name: "Local development",
    providerId: "local",
    sandbox: sandbox(undefined),
    createdBy: "Jamie Morgan",
  },
  {
    id: "remote",
    name: "Remote development",
    providerId: "daytona",
    sandbox: sandbox("team", "amends-dev-base"),
    createdBy: "Jamie Morgan",
  },
  {
    id: "review",
    name: "Review sandbox",
    providerId: "daytona",
    sandbox: sandbox("backup"),
    createdBy: "Jamie Morgan",
  },
];
const sampleAccounts: readonly SandboxAccountOption[] = [
  { id: "team", name: "Daytona · Team", ready: true },
  { id: "backup", name: "Daytona · Backup", ready: false },
];

const isKey = /^[A-Za-z_][A-Za-z0-9_]*$/;
const variableIssue = (draft: SandboxDraft, id: string) => {
  const index = draft.variables.findIndex((row) => row.id === id);
  const row = draft.variables[index];
  if (!row || (row.key === "" && row.value === "")) return undefined;
  if (!isKey.test(row.key.trim())) return "invalid" as const;
  return draft.variables.slice(0, index).some((other) => other.key.trim() === row.key.trim())
    ? ("duplicate" as const)
    : undefined;
};
const settled = (draft: SandboxDraft) =>
  JSON.stringify({
    accountId: draft.accountId,
    template: draft.template.trim(),
    env: draft.variables.filter((row) => row.key || row.value).map((row) => [row.key, row.value]),
    setup: draft.commands.map((row) => row.command.trim()).filter(Boolean),
    retention: draft.retention,
  });

type Dialog = "add" | "remove" | "create-account" | "account-key";

export interface EnvironmentsWorkspaceProps {
  readonly tab?: EnvironmentsTab;
  /** The environment whose page shows, in place of the list. */
  readonly selected?: string;
  readonly environmentTab?: EnvironmentTab;
  readonly dialog?: Dialog;
  /** For the add dialog: its step, the provider chosen, and a name typed. */
  readonly add?: {
    readonly step?: "basics" | "sandbox";
    readonly providerId?: string;
    readonly name?: string;
  };
  readonly status?: "loading" | "failed";
  /** No Daytona accounts yet. */
  readonly noAccounts?: boolean;
  /** A member who may only look. */
  readonly readOnly?: boolean;
  /** The first save of the sandbox settings finds the account no longer available. */
  readonly accountGone?: boolean;
}

/** The Environments rules over local state: two-step adding, the account detour, and toasts. */
export function EnvironmentsWorkspace(props: EnvironmentsWorkspaceProps) {
  const [records, setRecords] = createSignal<readonly Sample[]>(samples);
  const [accounts, setAccounts] = createSignal(props.noAccounts ? [] : sampleAccounts);
  const [tab, setTab] = createSignal<EnvironmentsTab>(props.tab ?? "all");
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(props.selected);
  const [environmentTab, setEnvironmentTab] = createSignal<EnvironmentTab>(
    props.environmentTab ?? "overview",
  );
  const [dialog, setDialog] = createSignal<Dialog | undefined>(props.dialog);
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({});
  const [configs, setConfigs] = createSignal<Readonly<Record<string, SandboxDraft>>>({});
  const [problems, setProblems] = createSignal<readonly EnvironmentProblem[]>([]);
  const [accountGone, setAccountGone] = createSignal(props.accountGone ?? false);
  const [adding, setAdding] = createSignal({
    step: props.add?.step ?? ("basics" as "basics" | "sandbox"),
    name: props.add?.name ?? "",
    harnessId: "amends",
    providerId: props.add?.providerId,
    sandbox:
      props.add?.providerId === "daytona"
        ? sandbox(props.noAccounts ? undefined : "team", "amends-dev-base")
        : props.add?.providerId === "local"
          ? sandbox(undefined)
          : empty(),
  });
  const [account, setAccount] = createSignal({ name: "Daytona · Builds", url: "", target: "us" });
  const [secret, setSecret] = createSignal("");
  // Where the account detour returns: the add dialog, or an environment's sandbox settings by ID.
  const [returnTo, setReturnTo] = createSignal<string>("add");
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);

  const providerOf = (id: string | undefined) =>
    sampleProviders.find((provider) => provider.id === id);
  const summaryOf = (record: Sample): EnvironmentSummary => {
    const provider = providerOf(record.providerId);
    const chosen = accounts().find((option) => option.id === record.sandbox.accountId);
    const issues: EnvironmentIssue[] =
      provider?.account && record.sandbox.accountId
        ? chosen
          ? chosen.ready
            ? []
            : ["connection-incomplete"]
          : ["connection-unavailable"]
        : [];
    return {
      id: record.id,
      name: record.name,
      harnessId: "amends",
      harness: { name: "Amends" },
      sandbox:
        record.providerId === undefined
          ? undefined
          : {
              providerId: record.providerId,
              provider,
              placement: "in-process",
              account: record.sandbox.accountId
                ? { id: record.sandbox.accountId, name: chosen?.name }
                : undefined,
              template: record.sandbox.template || undefined,
              variables: record.sandbox.variables.map(({ key, value }) => ({ key, value })),
              commands: record.sandbox.commands.map((row) => row.command),
              retention: record.sandbox.retention,
            },
      issues,
      manageable: !props.readOnly,
      createdBy: record.createdBy,
      createdAt: new Date(2026, 8, 28),
    };
  };
  const all = createMemo(() => records().map(summaryOf));
  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return all().filter(
      (environment) =>
        (tab() === "all" || environment.issues.length > 0) &&
        (!words || environment.name.toLowerCase().includes(words)),
    );
  });
  const current = () => all().find((environment) => environment.id === selected());
  const record = (id: string) => records().find((entry) => entry.id === id);
  const configOf = (id: string) => configs()[id] ?? record(id)?.sandbox ?? empty();

  /** Edits to a draft, whichever form holds it. */
  const editor = (draft: () => SandboxDraft, change: (next: SandboxDraft) => void) => ({
    accounts: accounts(),
    accountId: draft().accountId,
    onAccountChange: (accountId: string) => change({ ...draft(), accountId }),
    onCreateAccount: () => undefined as void,
    template: draft().template,
    onTemplateChange: (template: string) => change({ ...draft(), template }),
    variables: draft().variables,
    onAddVariable: () =>
      change({ ...draft(), variables: [...draft().variables, variable("", "")] }),
    onVariableChange: (id: string, update: { readonly key?: string; readonly value?: string }) =>
      change({
        ...draft(),
        variables: draft().variables.map((row) => (row.id === id ? { ...row, ...update } : row)),
      }),
    onRemoveVariable: (id: string) =>
      change({ ...draft(), variables: draft().variables.filter((row) => row.id !== id) }),
    variableIssue: (id: string) => variableIssue(draft(), id),
    commands: draft().commands,
    onAddCommand: () => change({ ...draft(), commands: [...draft().commands, command("")] }),
    onCommandChange: (id: string, text: string) =>
      change({
        ...draft(),
        commands: draft().commands.map((row) => (row.id === id ? { id, command: text } : row)),
      }),
    onMoveCommand: (id: string, by: -1 | 1) => {
      const commands = [...draft().commands];
      const index = commands.findIndex((row) => row.id === id);
      const [moved] = commands.splice(index, 1);
      if (moved) commands.splice(Math.max(0, Math.min(commands.length, index + by)), 0, moved);
      change({ ...draft(), commands });
    },
    onRemoveCommand: (id: string) =>
      change({ ...draft(), commands: draft().commands.filter((row) => row.id !== id) }),
    retention: draft().retention,
    onRetentionChange: (retention: Retention) => change({ ...draft(), retention }),
  });
  const startDetour = (from: string) => {
    setReturnTo(from);
    setAccount({ name: "Daytona · Builds", url: "", target: "us" });
    setSecret("");
    setDialog("create-account");
  };
  const finishDetour = (keySaved: boolean) => {
    const created = {
      id: `account-${accounts().length + 1}`,
      name: account().name,
      ready: keySaved,
    };
    setAccounts([...accounts(), created]);
    const back = returnTo();
    if (back === "add") {
      setAdding({ ...adding(), sandbox: { ...adding().sandbox, accountId: created.id } });
      setDialog("add");
    } else {
      setConfigs({ ...configs(), [back]: { ...configOf(back), accountId: created.id } });
      setDialog(undefined);
    }
    if (keySaved) toast("API key saved");
  };
  const addingProvider = () => providerOf(adding().providerId);
  const nav = navigation({ groups: [{ id: "general", name: "general" }] });
  const open = (id: string | undefined) => {
    setProblems([]);
    setEnvironmentTab("overview");
    setSelected(id);
  };
  const add = props.readOnly ? undefined : () => setDialog("add");
  // The sidebar's and list's links are plain hashes here: follow the list and each page.
  onMount(() => {
    const follow = () => {
      const target = window.location.hash.slice(1);
      if (target === "environments") return open(undefined);
      if (!target.startsWith("environment-")) return;
      const rest = target.slice("environment-".length);
      const tab = rest.endsWith("-sandbox") ? "sandbox" : "overview";
      const id = rest.replace(/-(sandbox|overview)$/, "");
      if (!records().some((entry) => entry.id === id)) return;
      if (id !== selected()) open(id);
      setEnvironmentTab(tab);
    };
    window.addEventListener("hashchange", follow);
    onCleanup(() => window.removeEventListener("hashchange", follow));
  });
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} destination="environments">
        <DestinationSidebar
          sections={[
            {
              id: "environments",
              title: "Environments",
              href: "#environments",
              current: !props.status && selected() === undefined,
              browse: { label: "Browse environments", onBrowse: () => open(undefined) },
              create: add && { label: "Add environment", onCreate: add },
              entries: props.status
                ? []
                : all().map((environment) => ({
                    id: environment.id,
                    name: environment.name,
                    href: `#environment-${environment.id}`,
                    current: selected() === environment.id,
                    icon: IconMarkEnvironments,
                    status: environmentStatus(environment.issues),
                  })),
              loading: props.status === "loading",
              empty: "No environments yet",
            },
          ]}
        />
      </WorkspaceNavigation>
      <Shell.Main>
        <Show
          when={!props.status && current()}
          fallback={
            <EnvironmentsPane
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
                      needsSetup: all().filter((environment) => environment.issues.length > 0)
                        .length,
                    }
              }
              onAdd={add}
              status={props.status}
              onRetry={() => {}}
            >
              <EnvironmentList
                tab={tab()}
                query={query()}
                onQueryChange={setQuery}
                environments={shown()}
                total={all().length}
                environmentHref={(id) => `#environment-${id}`}
                onAdd={add}
              />
            </EnvironmentsPane>
          }
        >
          {(environment) => {
            const id = () => environment().id;
            const changed = () =>
              configs()[id()] !== undefined &&
              settled(configOf(id())) !== settled(record(id())?.sandbox ?? empty()) &&
              configOf(id()).variables.every((row) => !variableIssue(configOf(id()), row.id));
            return (
              <EnvironmentPane
                workspaceName="Mercier & Co"
                environment={environment()}
                onBrowse={() => open(undefined)}
                tab={environmentTab()}
                tabHref={(next) => `#environment-${id()}-${next}`}
                onTabChange={setEnvironmentTab}
                name={names()[id()] ?? environment().name}
                onNameChange={(name) => setNames({ ...names(), [id()]: name })}
                nameChanged={
                  names()[id()] !== undefined &&
                  names()[id()]!.trim() !== "" &&
                  names()[id()]!.trim() !== environment().name
                }
                onSaveName={() => {
                  const name = names()[id()]!.trim();
                  setRecords(
                    records().map((entry) => (entry.id === id() ? { ...entry, name } : entry)),
                  );
                  const { [id()]: _saved, ...rest } = names();
                  setNames(rest);
                  toast(environmentsToast("rename"));
                }}
                sandbox={{
                  ...editor(
                    () => configOf(id()),
                    (next) => setConfigs({ ...configs(), [id()]: next }),
                  ),
                  onCreateAccount: () => startDetour(id()),
                }}
                sandboxChanged={changed()}
                onSaveSandbox={() => {
                  if (accountGone()) {
                    setAccountGone(false);
                    setProblems(["connection-unavailable"]);
                    return;
                  }
                  setProblems([]);
                  const next = configOf(id());
                  setRecords(
                    records().map((entry) =>
                      entry.id === id() ? { ...entry, sandbox: next } : entry,
                    ),
                  );
                  const { [id()]: _saved, ...rest } = configs();
                  setConfigs(rest);
                  toast(environmentsToast("configure"));
                }}
                onDiscardSandbox={() => {
                  const { [id()]: _saved, ...rest } = configs();
                  setConfigs(rest);
                  setProblems([]);
                  setEnvironmentTab("overview");
                }}
                onOpenAccount={() => toast("Opens the connection")}
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
      <AddEnvironment
        open={dialog() === "add"}
        onClose={() => setDialog(undefined)}
        step={adding().step}
        name={adding().name}
        onNameChange={(name) => setAdding({ ...adding(), name })}
        harnesses={harnesses}
        harnessId={adding().harnessId}
        onHarnessChange={(harnessId) => setAdding({ ...adding(), harnessId })}
        providers={sampleProviders}
        providerId={adding().providerId}
        onProviderChange={(providerId) =>
          setAdding({
            ...adding(),
            providerId,
            sandbox:
              providerId === "daytona" ? { ...empty(), accountId: accounts()[0]?.id } : empty(),
          })
        }
        placements={["in-process"]}
        placement="in-process"
        onPlacementChange={() => {}}
        basicsReady={adding().name.trim() !== ""}
        onContinue={() => setAdding({ ...adding(), step: "sandbox" })}
        onBack={() => setAdding({ ...adding(), step: "basics" })}
        sandbox={{
          ...editor(
            () => adding().sandbox,
            (next) => setAdding({ ...adding(), sandbox: next }),
          ),
          onCreateAccount: () => startDetour("add"),
        }}
        ready={
          adding().name.trim() !== "" &&
          (!addingProvider()?.account || adding().sandbox.accountId !== undefined) &&
          adding().sandbox.variables.every((row) => !variableIssue(adding().sandbox, row.id))
        }
        onCreate={() => {
          const created: Sample = {
            id: `environment-${records().length + 1}`,
            name: adding().name.trim(),
            providerId: adding().providerId,
            sandbox: adding().sandbox,
            createdBy: "Jamie Morgan",
          };
          setRecords([...records(), created]);
          setSelected(created.id);
          setEnvironmentTab("overview");
          setDialog(undefined);
          toast(environmentsToast("create", created.name));
        }}
      />
      <ConfigureConnection
        open={dialog() === "create-account"}
        onClose={() => setDialog(returnTo() === "add" ? "add" : undefined)}
        onBack={() => setDialog(returnTo() === "add" ? "add" : undefined)}
        returnTo={returnTo() === "add" ? adding().name || "New environment" : current()?.name}
        provider={{
          id: "daytona",
          name: "Daytona",
          description: "A Daytona account that environments run their sandboxes under.",
          capability: "sandboxes",
          methods: ["api-key"],
          settings: [
            {
              key: "apiUrl",
              label: "API URL",
              kind: "url",
              required: false,
              description: "Leave empty to use Daytona’s API.",
              placeholder: "https://app.daytona.io/api",
            },
            {
              key: "target",
              label: "Target",
              kind: "text",
              required: false,
              description: "The region, such as us or eu. Leave empty for your default.",
            },
          ],
        }}
        name={account().name}
        onNameChange={(name) => setAccount({ ...account(), name })}
        value={(key) => (key === "apiUrl" ? account().url : account().target)}
        onValueChange={(key, value) =>
          setAccount({ ...account(), ...(key === "apiUrl" ? { url: value } : { target: value }) })
        }
        method="api-key"
        onMethodChange={() => {}}
        ready={account().name.trim() !== ""}
        onCreate={() => setDialog("account-key")}
      />
      <ConnectionKey
        open={dialog() === "account-key"}
        onClose={() => finishDetour(false)}
        name={account().name}
        mode="setup"
        returnTo={returnTo() === "add" ? adding().name || "New environment" : current()?.name}
        secret={secret()}
        onSecretChange={setSecret}
        onSave={() => finishDetour(true)}
      />
      <Show when={current()}>
        {(environment) => (
          <ConfirmRemoveEnvironment
            open={dialog() === "remove"}
            onClose={() => setDialog(undefined)}
            name={environment().name}
            onConfirm={() => {
              const { id, name } = environment();
              setRecords(records().filter((entry) => entry.id !== id));
              setSelected(undefined);
              setDialog(undefined);
              toast(environmentsToast("remove", name));
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
