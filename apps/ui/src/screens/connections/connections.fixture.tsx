// Workshop harness: Connections with the Lunacy sample providers and connections, following the
// mocks' behavior notes over local state. Not exported.
import { For, Show, createMemo, createSignal } from "solid-js";
import { Toast } from "../../components/toast/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { navigation } from "../sample.ts";
import { WorkspaceNavigation } from "../workspace-navigation/index.ts";
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
  type ConnectionMethod,
  type ConnectionProviderOption,
  type ConnectionSummary,
  type ConnectionsAction,
  type ConnectionsError,
  type ConnectionsTab,
} from "./index.ts";

export const sampleProviders: readonly ConnectionProviderOption[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models through the Anthropic API.",
    capability: "model-access",
    methods: ["api-key"],
    settings: [
      {
        key: "baseUrl",
        label: "API URL",
        kind: "url",
        required: false,
        description: "Leave empty to use Anthropic’s default endpoint.",
        placeholder: "https://api.anthropic.com",
      },
    ],
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    description: "OpenAI, OpenRouter, or a compatible local server.",
    capability: "model-access",
    methods: ["api-key", "none"],
    settings: [
      {
        key: "baseUrl",
        label: "API URL",
        kind: "url",
        required: true,
        description: "Use the base URL before /chat/completions.",
        placeholder: "https://api.openai.com/v1",
      },
    ],
  },
  {
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
        description: "Leave empty to use Daytona's own API.",
        placeholder: "https://app.daytona.io/api",
      },
      {
        key: "target",
        label: "Target",
        kind: "text",
        required: false,
        description: "The region sandboxes run in, such as us or eu. Leave empty for your default.",
      },
    ],
  },
];

interface Sample {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly settings: Readonly<Record<string, string>>;
  readonly method: ConnectionMethod;
  readonly keySaved: boolean;
}

const samples: readonly Sample[] = [
  {
    id: "anthropic-team",
    name: "Anthropic · Team",
    providerId: "anthropic",
    settings: {},
    method: "api-key",
    keySaved: true,
  },
  {
    id: "local",
    name: "Local development",
    providerId: "openai-compatible",
    settings: { baseUrl: "http://127.0.0.1:11434/v1" },
    method: "api-key",
    keySaved: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter · Shared",
    providerId: "openai-compatible",
    settings: { baseUrl: "https://openrouter.ai/api/v1" },
    method: "api-key",
    keySaved: true,
  },
];

const isUrl = /^https?:\/\/[^\s/?#]+[^\s]*$/;
const urlIssue = (value: string) =>
  value.trim() !== "" && !isUrl.test(value.trim()) ? ("url" as const) : undefined;

type Dialog = "choose" | "configure" | "key" | "remove" | "remove-key";

export interface ConnectionsWorkspaceProps {
  readonly tab?: ConnectionsTab;
  /** The connection open in the side panel. */
  readonly selected?: string;
  readonly dialog?: Dialog;
  /** The provider being configured, for the configure dialog. */
  readonly provider?: string;
  /** How the configured connection authenticates, for the configure dialog. */
  readonly method?: ConnectionMethod;
  /** The key dialog's mode. */
  readonly keyMode?: "setup" | "add" | "replace";
  readonly status?: "loading" | "failed";
  /** No connections yet. */
  readonly empty?: boolean;
  /** The server no longer installs Anthropic. */
  readonly anthropicMissing?: boolean;
  /** A member who may only look. */
  readonly readOnly?: boolean;
  /** The server keeps no keys, so saving one fails. */
  readonly noKeyStorage?: boolean;
  /** The first attempt at this change finds the connection out of date. */
  readonly conflict?: ConnectionsAction;
  /** Drafts entered before the story opens. */
  readonly draft?: { readonly name?: string; readonly value?: string; readonly secret?: string };
}

/** The Connections rules over local state: two-step setup, write-only keys, and toasts. */
export function ConnectionsWorkspace(props: ConnectionsWorkspaceProps) {
  const providers = () =>
    props.anthropicMissing
      ? sampleProviders.filter((provider) => provider.id !== "anthropic")
      : sampleProviders;
  const [records, setRecords] = createSignal<readonly Sample[]>(props.empty ? [] : samples);
  const [tab, setTab] = createSignal<ConnectionsTab>(props.tab ?? "all");
  const [query, setQuery] = createSignal("");
  const [selected, setSelected] = createSignal(props.selected);
  const [dialog, setDialog] = createSignal<Dialog | undefined>(props.dialog);
  const [keyMode, setKeyMode] = createSignal(props.keyMode ?? "add");
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({});
  const [values, setValues] = createSignal<Readonly<Record<string, Record<string, string>>>>({});
  const [secret, setSecret] = createSignal(props.draft?.secret ?? "");
  const [creating, setCreating] = createSignal<{
    providerId: string;
    name: string;
    settings: Record<string, string>;
    method: ConnectionMethod;
  }>(
    props.provider
      ? {
          providerId: props.provider,
          name:
            props.draft?.name ??
            sampleProviders.find((provider) => provider.id === props.provider)?.name ??
            "",
          settings: { baseUrl: props.draft?.value ?? "" },
          method: props.method ?? "api-key",
        }
      : { providerId: "anthropic", name: "", settings: {}, method: "api-key" },
  );
  const [failure, setFailure] = createSignal<{
    action: ConnectionsAction;
    error: ConnectionsError;
  }>();
  const [conflict, setConflict] = createSignal(props.conflict);
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([]);
  let toastId = 0;
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }]);

  const summaryOf = (record: Sample): ConnectionSummary => {
    const provider = providers().find((candidate) => candidate.id === record.providerId);
    const settings = provider
      ? provider.settings.map((setting) => ({
          ...setting,
          value: record.settings[setting.key] ?? "",
        }))
      : Object.entries(record.settings).map(([key, value]) => ({
          key,
          label: "API URL",
          kind: "url" as const,
          required: false,
          value,
        }));
    const missingSettings = provider
      ? provider.settings
          .filter((setting) => setting.required && !record.settings[setting.key])
          .map((setting) => setting.label)
      : [];
    const missingKey = record.method === "api-key" && !record.keySaved;
    return {
      id: record.id,
      name: record.name,
      providerId: record.providerId,
      provider: provider && { name: provider.name, capability: provider.capability },
      settings,
      endpoint: settings.find((setting) => setting.kind === "url" && setting.value)?.value,
      setup: !provider
        ? "unavailable"
        : missingSettings.length > 0 || missingKey
          ? "needs-setup"
          : "configured",
      missing: { settings: missingSettings, key: missingKey },
      method: record.method,
      keySaved: record.keySaved,
      manageable: !props.readOnly,
      createdBy: "Jamie Morgan",
      createdAt: new Date(2026, 8, 28),
    };
  };
  const all = createMemo(() =>
    records()
      .map(summaryOf)
      .toSorted((left, right) => left.name.localeCompare(right.name)),
  );
  const shown = createMemo(() => {
    const words = query().trim().toLowerCase();
    return all().filter(
      (connection) =>
        (tab() === "all" || connection.setup === "needs-setup") &&
        (!words ||
          connection.name.toLowerCase().includes(words) ||
          (connection.provider?.name ?? "").toLowerCase().includes(words)),
    );
  });
  const current = () => all().find((connection) => connection.id === selected());
  const update = (id: string, change: Partial<Sample>) =>
    setRecords(records().map((record) => (record.id === id ? { ...record, ...change } : record)));

  /** Runs a change, unless this scenario finds it out of date or storage missing first. */
  const change = (action: ConnectionsAction, apply: () => string | undefined) => {
    if (conflict() === action) {
      setConflict(undefined);
      setFailure({ action, error: "changed" });
      return false;
    }
    if (action === "set-key" && props.noKeyStorage) {
      setFailure({ action, error: "storage-unavailable" });
      return false;
    }
    setFailure(undefined);
    toast(connectionsToast(action, apply()));
    return true;
  };
  const errorFor = (action: ConnectionsAction) =>
    failure()?.action === action ? failure()?.error : undefined;
  const close = () => {
    setFailure(undefined);
    setSecret("");
    setDialog(undefined);
  };
  const draftProvider = () =>
    providers().find((provider) => provider.id === creating().providerId) ?? sampleProviders[0]!;
  const nameOf = (id: string) => names()[id] ?? all().find((entry) => entry.id === id)?.name ?? "";
  const valueOf = (id: string, key: string) =>
    values()[id]?.[key] ?? records().find((record) => record.id === id)?.settings[key] ?? "";

  const nav = navigation({ groups: [{ id: "general", name: "general" }] });
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} destination="connections" />
      <Shell.Main>
        <ConnectionsPane
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
                  needsSetup: all().filter((entry) => entry.setup === "needs-setup").length,
                }
          }
          onAdd={props.readOnly ? undefined : () => setDialog("choose")}
          status={props.status}
          onRetry={() => {}}
        >
          <ConnectionList
            tab={tab()}
            query={query()}
            onQueryChange={setQuery}
            connections={shown()}
            total={all().length}
            providers={providers().map((provider) => provider.name)}
            selectedId={selected()}
            connectionHref={(id) => `#connection-${id}`}
            onOpen={(id) => {
              setFailure(undefined);
              setSelected(id);
            }}
            onAdd={props.readOnly ? undefined : () => setDialog("choose")}
          />
        </ConnectionsPane>
        <Show when={!props.status && current()}>
          {(connection) => (
            <ConnectionDetails
              workspaceName="Mercier & Co"
              connection={connection()}
              onClose={() => setSelected(undefined)}
              name={nameOf(connection().id)}
              onNameChange={(name) => setNames({ ...names(), [connection().id]: name })}
              nameChanged={
                names()[connection().id] !== undefined &&
                names()[connection().id]?.trim() !== "" &&
                names()[connection().id]?.trim() !== connection().name
              }
              onSaveName={() =>
                change("rename", () => {
                  update(connection().id, { name: nameOf(connection().id).trim() });
                  const { [connection().id]: _saved, ...rest } = names();
                  setNames(rest);
                  return undefined;
                })
              }
              value={(key) => valueOf(connection().id, key)}
              onValueChange={(key, value) =>
                setValues({
                  ...values(),
                  [connection().id]: { ...values()[connection().id], [key]: value },
                })
              }
              issue={(key) => urlIssue(valueOf(connection().id, key))}
              settingsChanged={
                values()[connection().id] !== undefined &&
                connection().settings.every(
                  (setting) =>
                    !urlIssue(valueOf(connection().id, setting.key)) &&
                    (!setting.required || valueOf(connection().id, setting.key).trim() !== ""),
                ) &&
                connection().settings.some(
                  (setting) => valueOf(connection().id, setting.key).trim() !== setting.value,
                )
              }
              onSaveSettings={() =>
                change("configure", () => {
                  const edited = values()[connection().id] ?? {};
                  update(connection().id, {
                    settings: Object.fromEntries(
                      Object.entries(edited)
                        .map(([key, value]) => [key, value.trim()] as const)
                        .filter(([, value]) => value !== ""),
                    ),
                  });
                  const { [connection().id]: _saved, ...rest } = values();
                  setValues(rest);
                  return undefined;
                })
              }
              onSetKey={() => {
                setKeyMode(connection().keySaved ? "replace" : "add");
                setDialog("key");
              }}
              onRemoveKey={() => setDialog("remove-key")}
              onRemove={() => setDialog("remove")}
              failure={
                failure() && !dialog()
                  ? (failure() as { action: ConnectionsAction; error: ConnectionsError })
                  : undefined
              }
              onRefresh={() => setFailure(undefined)}
            />
          )}
        </Show>
      </Shell.Main>
      <ChooseProvider
        open={dialog() === "choose"}
        onClose={close}
        workspaceName="Mercier & Co"
        providers={providers()}
        onChoose={(providerId) => {
          const provider = providers().find((candidate) => candidate.id === providerId);
          setCreating({
            providerId,
            name: provider?.name ?? "",
            settings: {},
            method: provider?.methods[0] ?? "none",
          });
          setDialog("configure");
        }}
      />
      <ConfigureConnection
        open={dialog() === "configure"}
        onClose={close}
        onBack={() => setDialog("choose")}
        provider={draftProvider()}
        name={creating().name}
        onNameChange={(name) => setCreating({ ...creating(), name })}
        value={(key) => creating().settings[key] ?? ""}
        onValueChange={(key, value) =>
          setCreating({ ...creating(), settings: { ...creating().settings, [key]: value } })
        }
        issue={(key) => urlIssue(creating().settings[key] ?? "")}
        method={creating().method}
        onMethodChange={(method) => setCreating({ ...creating(), method })}
        ready={
          creating().name.trim() !== "" &&
          draftProvider().settings.every(
            (setting) =>
              !urlIssue(creating().settings[setting.key] ?? "") &&
              (!setting.required || (creating().settings[setting.key] ?? "").trim() !== ""),
          )
        }
        onCreate={() => {
          const draft = creating();
          const id = `connection-${records().length + 1}`;
          const created = change("create", () => {
            setRecords([
              ...records(),
              {
                id,
                name: draft.name.trim(),
                providerId: draft.providerId,
                settings: Object.fromEntries(
                  Object.entries(draft.settings).filter(([, value]) => value.trim() !== ""),
                ),
                method: draft.method,
                keySaved: false,
              },
            ]);
            return draft.name.trim();
          });
          if (!created) return;
          setSelected(id);
          if (draft.method === "api-key") {
            setKeyMode("setup");
            setDialog("key");
          } else setDialog(undefined);
        }}
        error={errorFor("create")}
        onRefresh={() => setFailure(undefined)}
      />
      <Show when={current()}>
        {(connection) => (
          <>
            <ConnectionKey
              open={dialog() === "key"}
              onClose={close}
              name={connection().name}
              mode={keyMode()}
              secret={secret()}
              onSecretChange={setSecret}
              onSave={() => {
                const saved = change("set-key", () => {
                  update(connection().id, { keySaved: true });
                  return undefined;
                });
                if (saved) close();
              }}
              error={errorFor("set-key")}
              onRefresh={() => setFailure(undefined)}
            />
            <ConfirmRemoveKey
              open={dialog() === "remove-key"}
              onClose={close}
              name={connection().name}
              onConfirm={() => {
                if (
                  change("clear-key", () => {
                    update(connection().id, { keySaved: false });
                    return undefined;
                  })
                )
                  close();
              }}
              error={errorFor("clear-key")}
              onRefresh={() => setFailure(undefined)}
            />
            <ConfirmRemoveConnection
              open={dialog() === "remove"}
              onClose={close}
              name={connection().name}
              keySaved={connection().keySaved}
              onConfirm={() => {
                const { id, name } = connection();
                if (
                  change("remove", () => {
                    setRecords(records().filter((record) => record.id !== id));
                    return name;
                  })
                ) {
                  close();
                  setSelected(undefined);
                }
              }}
              error={errorFor("remove")}
              onRefresh={() => setFailure(undefined)}
            />
          </>
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
