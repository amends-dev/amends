import { IconMarkConnections } from "@amends-dev/icons"
// Workshop harness: Connections over local state, with integrations shaped like those the local
// host installs. Not exported.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { FormField, FormIssue } from "../../components/form-fields/index.ts"
import { Toast } from "../../components/toast/index.ts"
import { Shell } from "../../patterns/shell/index.ts"
import { navigation } from "../sample.ts"
import { DestinationSidebar, WorkspaceNavigation, type NavigationSection } from "../workspace-navigation/index.ts"
import {
  ChooseIntegration,
  ConfigureConnection,
  ConfirmRemoveConnection,
  ConnectionList,
  ConnectionPane,
  ConnectionsPane,
  ReplaceKey,
  capabilityLabels,
  capabilityNouns,
  connectionStatus,
  connectionsToast,
  type AuthMethod,
  type ConnectionHealth,
  type ConnectionSummary,
  type ConnectionsAction,
  type ConnectionsFailure,
  type ConnectionsTab,
  type IntegrationCapability,
  type IntegrationOption
} from "./index.ts"

const modelProvider = (id: string, name: string): IntegrationOption => ({
  id,
  name,
  provides: ["models"],
  auth: ["apiKey"],
  fields: []
})

const keyHeader: FormField = {
  key: "keyHeader",
  label: "Key header",
  description: "The header the API key goes in, as it is. Without one, it goes in Authorization as a bearer token.",
  required: false,
  kind: "text",
  minLength: 1
}

export const sampleIntegrations: ReadonlyArray<IntegrationOption> = [
  modelProvider("anthropic", "Anthropic"),
  modelProvider("deepseek", "DeepSeek"),
  modelProvider("fireworks-ai", "Fireworks AI"),
  modelProvider("google", "Google"),
  modelProvider("groq", "Groq"),
  modelProvider("mistral", "Mistral"),
  modelProvider("openai", "OpenAI"),
  modelProvider("openrouter", "OpenRouter"),
  modelProvider("togetherai", "Together AI"),
  modelProvider("xai", "xAI"),
  {
    id: "openai-compatible",
    name: "OpenAI-compatible API",
    provides: ["models"],
    auth: ["apiKey", "none"],
    fields: [
      {
        key: "url",
        label: "Base URL",
        description: "The API's base URL, before /chat/completions.",
        required: true,
        kind: "text",
        minLength: 1
      }
    ]
  },
  {
    id: "mcp",
    name: "MCP server",
    docs: "https://modelcontextprotocol.io",
    provides: ["tools"],
    auth: ["apiKey", "none"],
    fields: [
      {
        key: "url",
        label: "Server URL",
        description: "Where the MCP server answers over Streamable HTTP.",
        required: true,
        kind: "text",
        minLength: 1
      },
      keyHeader
    ]
  },
  {
    id: "openapi",
    name: "HTTP API",
    docs: "https://spec.openapis.org/oas/latest.html",
    provides: ["tools"],
    auth: ["apiKey", "none"],
    fields: [
      {
        key: "documentUrl",
        label: "Document URL",
        description: "Where the API's OpenAPI document is, as JSON.",
        required: true,
        kind: "text",
        minLength: 1
      },
      {
        key: "baseUrl",
        label: "Base URL",
        description: "Where the API's requests go, when not to the first server its document names.",
        required: false,
        kind: "text",
        minLength: 1
      },
      keyHeader
    ]
  },
  { id: "local", name: "This machine", provides: ["sandboxes"], auth: ["none"], fields: [] },
  {
    id: "daytona",
    name: "Daytona",
    docs: "https://www.daytona.io/docs",
    provides: ["sandboxes"],
    auth: ["apiKey"],
    fields: [
      {
        key: "apiUrl",
        label: "API URL",
        description: "Leave empty to use Daytona's own API.",
        required: false,
        kind: "text",
        minLength: 1
      },
      {
        key: "target",
        label: "Target",
        description: "The region sandboxes run in, such as us or eu.",
        required: false,
        kind: "text",
        minLength: 1
      }
    ]
  },
  { id: "amends", name: "amends", provides: ["harnesses"], auth: ["none"], fields: [] },
  {
    id: "opencode-agent",
    name: "opencode",
    docs: "https://opencode.ai/docs",
    provides: ["harnesses"],
    auth: ["none"],
    fields: []
  }
]

interface Sample {
  readonly id: string
  readonly name: string
  readonly integrationId: string
  readonly settings: Readonly<Record<string, string>>
  readonly auth: AuthMethod
  /** Why its integration refuses its setup, if it does. */
  readonly refused?: string
  /** What checking it finds, when not that it works. */
  readonly health?: ConnectionHealth
}

const samples: ReadonlyArray<Sample> = [
  {
    id: "openrouter",
    name: "OpenRouter · Shared",
    integrationId: "openrouter",
    settings: {},
    auth: "apiKey"
  },
  {
    id: "search-tools",
    name: "Search tools",
    integrationId: "mcp",
    settings: { url: "https://search.example.com/mcp" },
    auth: "apiKey",
    health: { status: "unauthorized", description: "The server refused the key (401)." }
  },
  {
    id: "docs-api",
    name: "Docs API",
    integrationId: "openapi",
    settings: { documentUrl: "https://docs.example.com/openapi.json", region: "eu" },
    auth: "none",
    refused: "HTTP API takes no setting named region."
  },
  { id: "this-machine", name: "This machine", integrationId: "local", settings: {}, auth: "none" },
  { id: "amends", name: "amends", integrationId: "amends", settings: {}, auth: "none" },
  {
    id: "vertex",
    name: "Vertex · Research",
    integrationId: "google-vertex",
    settings: { project: "mercier-research", location: "us-central1" },
    auth: "apiKey"
  }
]

/** What a field refuses in a value, as the app's client would tell it. */
const fieldIssue = (field: FormField | undefined, value: string): FormIssue | undefined => {
  if (field === undefined || value.trim() === "") return undefined
  if (field.kind === "text" && field.format === "uri" && !URL.canParse(value)) return "format"
  if (field.kind === "number" && Number.isNaN(Number(value))) return "format"
  return undefined
}
/** The fields are complete: every required one has a value and none is refused. */
const complete = (fields: ReadonlyArray<FormField>, values: Readonly<Record<string, string>>) =>
  fields.every(
    (field) =>
      (!field.required || (values[field.key] ?? "").trim() !== "") && !fieldIssue(field, values[field.key] ?? "")
  )
const cleaned = (values: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== "")
  )

type Dialog = "choose" | "configure" | "replace-key" | "remove"

export interface ConnectionsWorkspaceProps {
  readonly tab?: ConnectionsTab
  /** The connection open in the main content. */
  readonly selected?: string
  readonly dialog?: Dialog
  /** The capability Add was asked for from, for the choose dialog. */
  readonly capability?: IntegrationCapability
  /** The integration being configured, for the configure dialog. */
  readonly integration?: string
  /** How the configured connection authenticates, for the configure dialog. */
  readonly auth?: AuthMethod
  readonly status?: "loading" | "failed"
  /** No connections yet. */
  readonly empty?: boolean
  /** A member who may only look. */
  readonly readOnly?: boolean
  /** The host keeps no keys, so creating a connection with one fails. */
  readonly noKeyStorage?: boolean
  /** The first attempt at this change finds the connection out of date. */
  readonly conflict?: ConnectionsAction
  /** Drafts entered before the story opens. */
  readonly draft?: {
    readonly name?: string
    readonly settings?: Readonly<Record<string, string>>
    readonly apiKey?: string
  }
}

/** The Connections rules over local state: one-step setup with its key, checks, and toasts. */
export function ConnectionsWorkspace(props: ConnectionsWorkspaceProps) {
  const integrations = sampleIntegrations
  const integrationOf = (id: string) => integrations.find((candidate) => candidate.id === id)
  const [records, setRecords] = createSignal<ReadonlyArray<Sample>>(props.empty ? [] : samples)
  const [tab, setTab] = createSignal<ConnectionsTab>(props.tab ?? "all")
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(props.selected)
  const [dialog, setDialog] = createSignal<Dialog | undefined>(props.dialog)
  const [capability, setCapability] = createSignal(props.capability)
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({})
  const [values, setValues] = createSignal<Readonly<Record<string, Record<string, string>>>>({})
  const [apiKey, setApiKey] = createSignal(props.draft?.apiKey ?? "")
  const [health, setHealth] = createSignal<Readonly<Record<string, ConnectionHealth>>>({})
  const [pending, setPending] = createSignal<ConnectionsAction>()
  const [creating, setCreating] = createSignal<{
    integrationId: string
    name: string
    settings: Readonly<Record<string, string>>
    auth: AuthMethod
  }>({
    integrationId: props.integration ?? "mcp",
    name: props.draft?.name ?? integrationOf(props.integration ?? "mcp")?.name ?? "",
    settings: props.draft?.settings ?? {},
    auth: props.auth ?? integrationOf(props.integration ?? "mcp")?.auth[0] ?? "none"
  })
  const [failure, setFailure] = createSignal<ConnectionsFailure>()
  const [conflict, setConflict] = createSignal(props.conflict)
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([])
  let toastId = 0
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }])

  const summaryOf = (record: Sample): ConnectionSummary => {
    const integration = integrationOf(record.integrationId)
    return {
      id: record.id,
      name: record.name,
      integrationId: record.integrationId,
      integration: integration && {
        name: integration.name,
        docs: integration.docs,
        provides: integration.provides
      },
      fields: integration?.fields ?? [],
      settings: record.settings,
      auth: record.auth,
      readiness: !integration
        ? { state: "uninstalled" }
        : record.refused
          ? { state: "invalid", description: record.refused }
          : { state: "ready" },
      manageable: !props.readOnly,
      createdBy: "Jamie Morgan",
      createdAt: new Date(2026, 9, 2)
    }
  }
  const all = createMemo(() =>
    records()
      .map(summaryOf)
      .toSorted((left, right) => left.name.localeCompare(right.name))
  )
  const inTab = (connection: ConnectionSummary, next: ConnectionsTab) =>
    next === "all" || (connection.integration?.provides.includes(next) ?? false)
  const shown = createMemo(() => {
    const words = query().trim().toLowerCase()
    return all().filter(
      (connection) =>
        inTab(connection, tab()) &&
        (!words ||
          connection.name.toLowerCase().includes(words) ||
          (connection.integration?.name ?? "").toLowerCase().includes(words))
    )
  })
  const current = () => all().find((connection) => connection.id === selected())
  const update = (id: string, change: Partial<Sample>) =>
    setRecords(records().map((record) => (record.id === id ? { ...record, ...change } : record)))

  /** Runs a change, unless this scenario finds it out of date first. */
  const change = (action: Exclude<ConnectionsAction, "check">, apply: () => string | undefined) => {
    if (conflict() === action) {
      setConflict(undefined)
      setFailure({ action, error: "changed" })
      return false
    }
    setFailure(undefined)
    toast(connectionsToast(action, apply()))
    return true
  }
  /** Asks the connection's system whether it works, which answers a moment later. */
  const check = (id: string) => {
    setFailure(undefined)
    setPending("check")
    setTimeout(() => {
      const record = records().find((candidate) => candidate.id === id)
      setPending(undefined)
      if (record) setHealth({ ...health(), [id]: record.health ?? { status: "healthy" } })
    }, 300)
  }
  const failureFor = (action: ConnectionsAction) => (failure()?.action === action ? failure() : undefined)
  const close = () => {
    setFailure(undefined)
    setApiKey("")
    setDialog(undefined)
  }
  const draftIntegration = () => integrationOf(creating().integrationId) ?? integrations[0]!
  const nameOf = (id: string) => names()[id] ?? all().find((entry) => entry.id === id)?.name ?? ""
  const valueOf = (id: string, key: string) =>
    values()[id]?.[key] ?? records().find((record) => record.id === id)?.settings[key] ?? ""

  const open = (id: string | undefined) => {
    setFailure(undefined)
    setSelected(id)
  }
  const add = (next?: IntegrationCapability) =>
    props.readOnly
      ? undefined
      : () => {
          setCapability(next)
          setDialog("choose")
        }
  /** A sidebar section: the connections that give one capability. */
  const section = (next: IntegrationCapability): NavigationSection => {
    const create = add(next)
    return {
      id: next,
      title: capabilityLabels[next],
      href: `#${next}`,
      browse: {
        label: `Browse ${capabilityLabels[next].toLowerCase()}`,
        onBrowse: () => {
          setTab(next)
          open(undefined)
        }
      },
      create: create && { label: `Add ${capabilityNouns[next]} connection`, onCreate: create },
      entries: props.status
        ? []
        : all()
            .filter((connection) => connection.integration?.provides.includes(next))
            .map((connection) => ({
              id: connection.id,
              name: connection.name,
              href: `#connection-${connection.id}`,
              current: selected() === connection.id,
              icon: IconMarkConnections,
              status: connectionStatus(connection)
            })),
      loading: props.status === "loading",
      empty: "None yet"
    }
  }
  // The sidebar's and list's links are plain hashes here: follow the list and each page.
  onMount(() => {
    const follow = () => {
      const target = window.location.hash.slice(1)
      if (target.startsWith("connection-")) {
        const id = target.slice("connection-".length)
        if (records().some((entry) => entry.id === id) && id !== selected()) open(id)
      } else if (target === "all" || target in capabilityLabels) {
        setTab(target as ConnectionsTab)
        open(undefined)
      }
    }
    window.addEventListener("hashchange", follow)
    onCleanup(() => window.removeEventListener("hashchange", follow))
  })
  const nav = navigation({ groups: [{ id: "general", name: "general" }] })
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} destination="connections">
        <DestinationSidebar sections={(["models", "tools", "sandboxes", "harnesses"] as const).map(section)} />
      </WorkspaceNavigation>
      <Shell.Main>
        <Show
          when={!props.status && current()}
          fallback={
            <ConnectionsPane
              workspaceName="Mercier & Co"
              tab={tab()}
              tabHref={(next) => `#${next}`}
              onTabChange={(next) => {
                setQuery("")
                setTab(next)
              }}
              counts={
                props.status
                  ? undefined
                  : {
                      all: all().length,
                      models: all().filter((entry) => inTab(entry, "models")).length,
                      tools: all().filter((entry) => inTab(entry, "tools")).length,
                      sandboxes: all().filter((entry) => inTab(entry, "sandboxes")).length,
                      harnesses: all().filter((entry) => inTab(entry, "harnesses")).length,
                      channels: all().filter((entry) => inTab(entry, "channels")).length
                    }
              }
              onAdd={add()}
              status={props.status}
              onRetry={() => {}}
            >
              <ConnectionList
                tab={tab()}
                query={query()}
                onQueryChange={setQuery}
                connections={shown()}
                total={all().length}
                connectionHref={(id) => `#connection-${id}`}
                onAdd={add()}
              />
            </ConnectionsPane>
          }
        >
          {(connection) => (
            <ConnectionPane
              workspaceName="Mercier & Co"
              connection={connection()}
              onBrowse={() => open(undefined)}
              name={nameOf(connection().id)}
              onNameChange={(name) => setNames({ ...names(), [connection().id]: name })}
              nameChanged={
                names()[connection().id] !== undefined &&
                names()[connection().id]?.trim() !== "" &&
                names()[connection().id]?.trim() !== connection().name
              }
              onSaveName={() =>
                change("rename", () => {
                  update(connection().id, { name: nameOf(connection().id).trim() })
                  const { [connection().id]: _saved, ...rest } = names()
                  setNames(rest)
                  return undefined
                })
              }
              value={(key) => valueOf(connection().id, key)}
              onValueChange={(key, value) =>
                setValues({
                  ...values(),
                  [connection().id]: { ...values()[connection().id], [key]: value }
                })
              }
              issue={(key) =>
                fieldIssue(
                  connection().fields.find((field) => field.key === key),
                  valueOf(connection().id, key)
                )
              }
              settingsChanged={
                values()[connection().id] !== undefined &&
                complete(
                  connection().fields,
                  Object.fromEntries(
                    connection().fields.map((field) => [field.key, valueOf(connection().id, field.key)])
                  )
                ) &&
                connection().fields.some(
                  (field) => valueOf(connection().id, field.key).trim() !== (connection().settings[field.key] ?? "")
                )
              }
              onSaveSettings={() =>
                change("configure", () => {
                  const saved = cleaned(
                    Object.fromEntries(
                      connection().fields.map((field) => [field.key, valueOf(connection().id, field.key)])
                    )
                  )
                  update(connection().id, { settings: saved, refused: undefined })
                  const { [connection().id]: _saved, ...rest } = values()
                  setValues(rest)
                  return undefined
                })
              }
              onReplaceKey={() => setDialog("replace-key")}
              onCheck={() => check(connection().id)}
              health={health()[connection().id]}
              onRemove={() => setDialog("remove")}
              pending={pending()}
              failure={failure() && !dialog() ? failure() : undefined}
              onRefresh={() => setFailure(undefined)}
            />
          )}
        </Show>
      </Shell.Main>
      <ChooseIntegration
        open={dialog() === "choose"}
        onClose={close}
        workspaceName="Mercier & Co"
        capability={capability()}
        integrations={integrations.filter((integration) => {
          const wanted = capability()
          return wanted === undefined || integration.provides.includes(wanted)
        })}
        onChoose={(integrationId) => {
          const integration = integrationOf(integrationId)
          setCreating({
            integrationId,
            name: integration?.name ?? "",
            settings: {},
            auth: integration?.auth[0] ?? "none"
          })
          setApiKey("")
          setDialog("configure")
        }}
      />
      <ConfigureConnection
        open={dialog() === "configure"}
        onClose={close}
        onBack={() => {
          setFailure(undefined)
          setDialog("choose")
        }}
        integration={draftIntegration()}
        name={creating().name}
        onNameChange={(name) => setCreating({ ...creating(), name })}
        value={(key) => creating().settings[key] ?? ""}
        onValueChange={(key, value) =>
          setCreating({ ...creating(), settings: { ...creating().settings, [key]: value } })
        }
        issue={(key) =>
          fieldIssue(
            draftIntegration().fields.find((field) => field.key === key),
            creating().settings[key] ?? ""
          )
        }
        auth={creating().auth}
        onAuthChange={(auth) => setCreating({ ...creating(), auth })}
        apiKey={apiKey()}
        onApiKeyChange={setApiKey}
        ready={
          creating().name.trim() !== "" &&
          complete(draftIntegration().fields, creating().settings) &&
          (creating().auth === "none" || apiKey().trim() !== "")
        }
        onCreate={() => {
          const draft = creating()
          if (draft.auth === "apiKey" && props.noKeyStorage) {
            setFailure({ action: "create", error: "storage-unavailable" })
            return
          }
          const id = `connection-${records().length + 1}`
          const created = change("create", () => {
            setRecords([
              ...records(),
              {
                id,
                name: draft.name.trim(),
                integrationId: draft.integrationId,
                settings: cleaned(draft.settings),
                auth: draft.auth
              }
            ])
            return draft.name.trim()
          })
          if (!created) return
          close()
          setSelected(id)
          check(id)
        }}
        failure={failureFor("create")}
        onRefresh={() => setFailure(undefined)}
      />
      <Show when={current()}>
        {(connection) => (
          <>
            <ReplaceKey
              open={dialog() === "replace-key"}
              onClose={close}
              name={connection().name}
              apiKey={apiKey()}
              onApiKeyChange={setApiKey}
              onSave={() => {
                if (change("replace-key", () => undefined)) close()
              }}
              failure={failureFor("replace-key")}
              onRefresh={() => setFailure(undefined)}
            />
            <ConfirmRemoveConnection
              open={dialog() === "remove"}
              onClose={close}
              name={connection().name}
              keySaved={connection().auth === "apiKey"}
              onConfirm={() => {
                const { id, name } = connection()
                if (
                  change("remove", () => {
                    setRecords(records().filter((record) => record.id !== id))
                    return name
                  })
                ) {
                  close()
                  setSelected(undefined)
                }
              }}
              failure={failureFor("remove")}
              onRefresh={() => setFailure(undefined)}
            />
          </>
        )}
      </Show>
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}>
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </Shell.Root>
  )
}
