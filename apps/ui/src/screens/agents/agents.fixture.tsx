// Workshop harness: Agents over local state, with connections shaped like those the local host
// installs. Not exported.
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { Toast } from "../../components/toast/index.ts"
import { Shell } from "../../patterns/shell/index.ts"
import { navigation } from "../sample.ts"
import { DestinationSidebar, WorkspaceNavigation } from "../workspace-navigation/index.ts"
import {
  AddAgent,
  AgentList,
  AgentPane,
  AgentsPane,
  ConfirmRemoveAgent,
  agentStatus,
  agentsToast,
  autoHarness,
  type AgentActivity,
  type AgentIssue,
  type AgentRoleOption,
  type AgentSummary,
  type AgentTurn,
  type AgentsAction,
  type AgentsFailure,
  type AgentsTab,
  type ConnectionOption,
  type Effort,
  type HarnessOption,
  type ModelChoices,
  type SetupFieldsProps
} from "./index.ts"

export const sampleHarnesses: ReadonlyArray<HarnessOption> = [
  { id: "amends", name: "Amends harness", integrationName: "amends", requiresSandbox: false },
  { id: "opencode", name: "opencode", integrationName: "opencode", requiresSandbox: true }
]

export const sampleModelConnections: ReadonlyArray<ConnectionOption> = [
  { id: "openrouter", name: "OpenRouter", integrationName: "OpenRouter" },
  { id: "local-models", name: "Local models", integrationName: "OpenAI-compatible API" }
]

export const sampleSandboxes: ReadonlyArray<ConnectionOption> = [
  { id: "this-machine", name: "This machine", integrationName: "This machine" },
  { id: "daytona", name: "Daytona", integrationName: "Daytona" }
]

/** A connection whose integration this host no longer installs. */
const uninstalled = { id: "vertex", name: "Vertex" }

/**
 * The options with the one an agent names when it is removed or not installed, which shows as
 * unavailable, as the client lists it.
 */
function withCurrent<Option extends ConnectionOption>(
  options: ReadonlyArray<Option>,
  id: string | undefined,
  unavailable: (option: ConnectionOption) => Option
): ReadonlyArray<Option> {
  if (id === undefined || id === autoHarness || options.some((option) => option.id === id)) return options
  return [
    ...options,
    unavailable(
      id === uninstalled.id
        ? {
            ...uninstalled,
            integrationName: "Vertex AI",
            unavailable: "Its integration isn’t installed on this host."
          }
        : {
            id,
            name: "Removed connection",
            integrationName: "",
            unavailable: "This connection was removed."
          }
    )
  ]
}

const sampleModels: Readonly<Record<string, ModelChoices>> = {
  openrouter: {
    status: "loaded",
    listed: [
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", efforts: ["low", "medium", "high", "max"] },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", efforts: ["low", "medium", "high"] },
      { id: "gpt-5-1", name: "GPT-5.1", efforts: ["minimal", "low", "medium", "high"] },
      { id: "deepseek-v4", name: "DeepSeek V4", efforts: [] }
    ],
    unlisted: false
  },
  "local-models": { status: "loaded", listed: [], unlisted: true }
}

const roles: ReadonlyArray<AgentRoleOption> = [
  { id: "builtin:member", name: "Member", assignable: true },
  { id: "builtin:administrator", name: "Administrator", assignable: false }
]

/** How an agent is set up, as the fixture keeps it and the form edits it. */
interface Setup {
  readonly instructions: string
  readonly harness: string
  readonly modelConnectionId: string | undefined
  readonly model: string
  readonly effort?: Effort
  readonly sandboxId?: string
}

interface Sample extends Setup {
  readonly id: string
  readonly name: string
}

const samples: ReadonlyArray<Sample> = [
  {
    id: "reviewer",
    name: "Reviewer",
    instructions: "Review each change for correctness and clarity, then run its tests.",
    harness: "opencode",
    modelConnectionId: "openrouter",
    model: "claude-opus-5-5",
    effort: "high",
    sandboxId: "daytona"
  },
  {
    id: "planner",
    name: "Planner",
    instructions: "Break each request into steps, and say who should take each.",
    harness: "amends",
    modelConnectionId: "openrouter",
    model: "gpt-5-1"
  },
  {
    id: "researcher",
    name: "Researcher",
    instructions: "Answer questions about the codebase, citing the files you read.",
    harness: autoHarness,
    modelConnectionId: "local-models",
    model: "qwen3-coder-30b"
  },
  {
    id: "tester",
    name: "Tester",
    instructions: "Reproduce each reported bug in a sandbox before anyone fixes it.",
    harness: "opencode",
    modelConnectionId: "openrouter",
    model: "claude-sonnet-5-5",
    sandboxId: "old-sandbox"
  },
  {
    id: "archivist",
    name: "Archivist",
    instructions: "Summarize each closed thread for the record.",
    harness: "amends",
    modelConnectionId: "vertex",
    model: "gemini-3-pro"
  }
]

/** What keeps an agent set up as `setup` from running, as core's readiness finds it. */
function issuesOf(setup: Setup, harnesses: ReadonlyArray<HarnessOption> = sampleHarnesses): ReadonlyArray<AgentIssue> {
  const issues: Array<AgentIssue> = []
  const harness = harnesses.find((option) => option.id === setup.harness)
  if (setup.harness === autoHarness) {
    const choosable = harnesses.some((option) => !option.requiresSandbox || setup.sandboxId !== undefined)
    if (!choosable) issues.push({ kind: "no-harness" })
  } else if (!harness) issues.push({ kind: "removed", part: "harness" })
  else if (harness.requiresSandbox && setup.sandboxId === undefined) issues.push({ kind: "sandbox-required" })
  const models = setup.modelConnectionId && sampleModels[setup.modelConnectionId]
  if (setup.modelConnectionId === uninstalled.id) issues.push({ kind: "uninstalled", part: "model" })
  else if (!models) issues.push({ kind: "removed", part: "model" })
  else if (models.status === "loaded" && !models.unlisted && !models.listed.some((model) => model.id === setup.model))
    issues.push({
      kind: "invalid",
      part: "model",
      description: `OpenRouter offers no model ${setup.model}`
    })
  if (setup.sandboxId !== undefined && !sampleSandboxes.some((option) => option.id === setup.sandboxId))
    issues.push({ kind: "removed", part: "sandbox" })
  return issues
}

/** Each agent's turns in progress, by its id; the others are idle. */
const sampleTurns: Readonly<Record<string, ReadonlyArray<AgentTurn>>> = {
  reviewer: [
    { id: "turn-review", state: "working", place: "#general", href: "#turn-review" },
    { id: "turn-design", state: "queued", place: "#design", href: "#turn-design" }
  ],
  planner: [{ id: "turn-plan", state: "stopping", place: "Jamie Morgan", href: "#turn-plan" }]
}

const urgency = { working: 0, stopping: 1, queued: 2 } as const

/** Where an agent is at work, as the client finds it from its turns in progress. */
const activityOf = (turns: ReadonlyArray<AgentTurn>): AgentActivity | undefined => {
  const [state] = turns.map((turn) => turn.state).toSorted((left, right) => urgency[left] - urgency[right])
  return state === undefined ? undefined : { state, places: turns.map((turn) => turn.place) }
}

const connectionName = (id: string | undefined) =>
  [...sampleHarnesses, ...sampleModelConnections, ...sampleSandboxes, uninstalled].find((option) => option.id === id)
    ?.name

function summaryOf(record: Sample, configurable: boolean, harnesses: ReadonlyArray<HarnessOption>): AgentSummary {
  const models = record.modelConnectionId ? sampleModels[record.modelConnectionId] : undefined
  const listed = models?.status === "loaded" ? models.listed.find((model) => model.id === record.model) : undefined
  const activity = activityOf(sampleTurns[record.id] ?? [])
  return {
    ...(activity && { activity }),
    id: record.id,
    memberId: `member-${record.id}`,
    name: record.name,
    instructions: record.instructions,
    harness:
      record.harness === autoHarness
        ? { kind: "auto" }
        : { kind: "connection", id: record.harness, name: connectionName(record.harness) },
    model: {
      connection: {
        id: record.modelConnectionId ?? "",
        name: connectionName(record.modelConnectionId)
      },
      id: record.model,
      name: listed?.name,
      effort: record.effort
    },
    sandbox:
      record.sandboxId === undefined ? undefined : { id: record.sandboxId, name: connectionName(record.sandboxId) },
    issues: issuesOf(record, harnesses),
    configurable,
    createdBy: "Jamie Morgan",
    createdAt: new Date(2026, 9, 6)
  }
}

const sameSetup = (left: Setup, right: Setup) =>
  left.instructions.trim() === right.instructions.trim() &&
  left.harness === right.harness &&
  left.modelConnectionId === right.modelConnectionId &&
  left.model.trim() === right.model.trim() &&
  left.effort === right.effort &&
  left.sandboxId === right.sandboxId

const emptySetup: Setup = {
  instructions: "",
  harness: autoHarness,
  modelConnectionId: undefined,
  model: ""
}

export interface AgentsWorkspaceProps {
  /** An agent's page, by id, in place of the list. */
  readonly selected?: string
  readonly tab?: AgentsTab
  readonly dialog?: "add" | "remove"
  /** The workspace has no agents. */
  readonly empty?: boolean
  readonly status?: "loading" | "failed" | "unavailable"
  /** The reader may read agents but not add or change them. */
  readonly readOnly?: boolean
  /** Every connection's models are still loading, or couldn't be read. */
  readonly modelsStatus?: "loading" | "failed"
  /** A draft to start adding from. */
  readonly draft?: Partial<Setup> & { readonly name?: string }
  /** No connection gives a harness. */
  readonly withoutHarnesses?: boolean
  /** The host refuses the next create, as this says. */
  readonly refuseCreate?: AgentsFailure
  /** The host finds this change out of date. */
  readonly conflict?: AgentsAction
}

/** Agents in a workspace, over sample connections, with every change applied in place. */
export function AgentsWorkspace(props: AgentsWorkspaceProps) {
  const [records, setRecords] = createSignal<ReadonlyArray<Sample>>(props.empty ? [] : samples)
  const [selected, setSelected] = createSignal(props.selected)
  const [tab, setTab] = createSignal<AgentsTab>(props.tab ?? "all")
  const [query, setQuery] = createSignal("")
  const [dialog, setDialog] = createSignal(props.dialog)
  const [names, setNames] = createSignal<Readonly<Record<string, string>>>({})
  const [drafts, setDrafts] = createSignal<Readonly<Record<string, Setup>>>({})
  const [adding, setAdding] = createSignal({
    name: props.draft?.name ?? "",
    roleId: "builtin:member",
    setup: { ...emptySetup, ...props.draft }
  })
  const [failure, setFailure] = createSignal<AgentsFailure>()
  const [refusal, setRefusal] = createSignal(props.refuseCreate)
  const [conflict, setConflict] = createSignal(props.conflict)
  const [toasts, setToasts] = createSignal<Array<{ id: number; text: string }>>([])
  let toastId = 0
  const toast = (text: string) => setToasts([...toasts(), { id: ++toastId, text }])
  const harnesses = props.withoutHarnesses ? [] : sampleHarnesses

  const all = createMemo(() =>
    records()
      .map((record) => summaryOf(record, !props.readOnly, harnesses))
      .toSorted((left, right) => left.name.localeCompare(right.name))
  )
  const inTab = (agent: AgentSummary, next: AgentsTab) => next === "all" || agent.issues.length > 0
  const shown = createMemo(() => {
    const words = query().trim().toLowerCase()
    return all().filter((agent) => inTab(agent, tab()) && (!words || agent.name.toLowerCase().includes(words)))
  })
  const current = () => all().find((agent) => agent.id === selected())
  const saved = (id: string) => records().find((record) => record.id === id) ?? samples[0]!
  const draftOf = (id: string) => drafts()[id] ?? saved(id)
  const update = (id: string, change: Partial<Sample>) =>
    setRecords(records().map((record) => (record.id === id ? Object.assign({}, record, change) : record)))

  /** Runs a change, unless this scenario finds it out of date first. */
  const change = (action: AgentsAction, apply: () => string | undefined) => {
    if (conflict() === action) {
      setConflict(undefined)
      setFailure({ action, error: "changed" })
      return false
    }
    setFailure(undefined)
    toast(agentsToast(action, apply()))
    return true
  }
  const modelsOf = (connectionId: string | undefined): ModelChoices | undefined => {
    if (connectionId === undefined) return undefined
    if (props.modelsStatus) return { status: props.modelsStatus }
    return sampleModels[connectionId]
  }
  /** The setup form's fields over a draft, which `edit` changes. */
  const setupProps = (
    setup: Setup,
    edit: (change: Partial<Setup>) => void
  ): Omit<SetupFieldsProps, "problems" | "disabled"> => ({
    instructions: setup.instructions,
    onInstructionsChange: (instructions) => edit({ instructions }),
    harness: setup.harness,
    onHarnessChange: (harness) => edit({ harness }),
    harnesses: withCurrent(harnesses, setup.harness, (option) => ({
      ...option,
      requiresSandbox: false
    })),
    modelConnections: withCurrent(sampleModelConnections, setup.modelConnectionId, (option) => option),
    modelConnectionId: setup.modelConnectionId,
    onModelConnectionChange: (modelConnectionId) => edit({ modelConnectionId, model: "", effort: undefined }),
    models: modelsOf(setup.modelConnectionId),
    model: setup.model,
    onModelChange: (model) => edit({ model }),
    effort: setup.effort,
    onEffortChange: (effort) => edit({ effort }),
    sandboxes: withCurrent(sampleSandboxes, setup.sandboxId, (option) => option),
    sandboxId: setup.sandboxId,
    onSandboxChange: (sandboxId) => edit({ sandboxId })
  })
  const nameOf = (id: string) => names()[id] ?? all().find((entry) => entry.id === id)?.name ?? ""
  const close = () => {
    setFailure(undefined)
    setDialog(undefined)
  }
  const open = (id: string | undefined) => {
    setFailure(undefined)
    setSelected(id)
  }
  const add = props.readOnly ? undefined : () => setDialog("add")
  // The sidebar's and list's links are plain hashes here: follow the list and each agent's page.
  onMount(() => {
    const follow = () => {
      const target = window.location.hash.slice(1)
      if (target.startsWith("agent-")) {
        const id = target.slice("agent-".length)
        if (records().some((entry) => entry.id === id) && id !== selected()) open(id)
      } else if (target === "all" || target === "needs-setup") {
        setTab(target)
        open(undefined)
      }
    }
    window.addEventListener("hashchange", follow)
    onCleanup(() => window.removeEventListener("hashchange", follow))
  })
  const nav = navigation({ groups: [{ id: "general", name: "general" }] })
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav} destination="agents">
        <DestinationSidebar
          sections={[
            {
              id: "agents",
              title: "Agents",
              href: "#all",
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
                    status: agentStatus(agent.issues, agent.activity)
                  })),
              loading: props.status === "loading",
              empty: "No agents yet"
            }
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
                setQuery("")
                setTab(next)
              }}
              counts={
                props.status
                  ? undefined
                  : {
                      all: all().length,
                      "needs-setup": all().filter((agent) => inTab(agent, "needs-setup")).length
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
                agentHref={(id) => `#agent-${id}`}
                onAdd={add}
              />
            </AgentsPane>
          }
        >
          {(agent) => (
            <AgentPane
              workspaceName="Mercier & Co"
              agent={agent()}
              turns={sampleTurns[agent().id] ?? []}
              onBrowse={() => open(undefined)}
              name={nameOf(agent().id)}
              onNameChange={(name) => setNames({ ...names(), [agent().id]: name })}
              nameChanged={
                names()[agent().id] !== undefined &&
                names()[agent().id]?.trim() !== "" &&
                names()[agent().id]?.trim() !== agent().name
              }
              onSaveName={() =>
                change("rename", () => {
                  update(agent().id, { name: nameOf(agent().id).trim() })
                  const { [agent().id]: _saved, ...rest } = names()
                  setNames(rest)
                  return undefined
                })
              }
              setup={setupProps(draftOf(agent().id), (edit) =>
                setDrafts({
                  ...drafts(),
                  [agent().id]: Object.assign({}, draftOf(agent().id), edit)
                })
              )}
              setupChanged={drafts()[agent().id] !== undefined && !sameSetup(draftOf(agent().id), saved(agent().id))}
              onSaveSetup={() => {
                const draft = draftOf(agent().id)
                const issues = issuesOf(draft, harnesses).filter((issue) => issue.kind !== "no-harness")
                if (issues.length > 0) {
                  setFailure({ action: "configure", error: "incomplete", issues })
                  return
                }
                change("configure", () => {
                  update(agent().id, draft)
                  const { [agent().id]: _saved, ...rest } = drafts()
                  setDrafts(rest)
                  return undefined
                })
              }}
              onDiscardSetup={() => {
                setFailure(undefined)
                const { [agent().id]: _discarded, ...rest } = drafts()
                setDrafts(rest)
              }}
              onRemove={props.readOnly ? undefined : () => setDialog("remove")}
              failure={failure() && !dialog() ? failure() : undefined}
              onRefresh={() => setFailure(undefined)}
            />
          )}
        </Show>
      </Shell.Main>
      <AddAgent
        open={dialog() === "add"}
        onClose={close}
        workspaceName="Mercier & Co"
        name={adding().name}
        onNameChange={(name) => setAdding({ ...adding(), name })}
        roles={roles}
        roleId={adding().roleId}
        onRoleChange={(roleId) => setAdding({ ...adding(), roleId })}
        setup={setupProps(adding().setup, (edit) =>
          setAdding({ ...adding(), setup: Object.assign({}, adding().setup, edit) })
        )}
        ready={
          adding().name.trim() !== "" &&
          adding().setup.modelConnectionId !== undefined &&
          adding().setup.model.trim() !== ""
        }
        onCreate={() => {
          const refused = refusal()
          if (refused) {
            setRefusal(undefined)
            setFailure(refused)
            return
          }
          const draft = adding()
          const issues = issuesOf(draft.setup, harnesses).filter((issue) => issue.kind !== "no-harness")
          if (issues.length > 0) {
            setFailure({ action: "create", error: "incomplete", issues })
            return
          }
          const id = draft.name.trim().toLowerCase().replaceAll(/\W+/g, "-")
          const created = change("create", () => {
            setRecords([...records(), { id, name: draft.name.trim(), ...draft.setup }])
            return draft.name.trim()
          })
          if (!created) return
          close()
          setAdding({ name: "", roleId: "builtin:member", setup: emptySetup })
          setSelected(id)
        }}
        failure={failure()?.action === "create" ? failure() : undefined}
        onRefresh={() => setFailure(undefined)}
      />
      <Show when={current()}>
        {(agent) => (
          <ConfirmRemoveAgent
            open={dialog() === "remove"}
            onClose={close}
            name={agent().name}
            onConfirm={() => {
              const { id, name } = agent()
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
            failure={failure()?.action === "remove" ? failure() : undefined}
            onRefresh={() => setFailure(undefined)}
          />
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
