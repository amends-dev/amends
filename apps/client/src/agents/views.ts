import type {
  AgentActivity,
  AgentIssue,
  AgentRoleOption,
  AgentSummary,
  AgentTurn,
  AgentsAction,
  AgentsFailure,
  ConnectionOption,
  Effort,
  HarnessOption,
  ModelChoices,
  SetupConnection,
  SetupFieldsProps,
  SetupPart
} from "@amends-dev/ui/screens/agents"
import { useAtomRefresh, useAtomValue } from "@effect/atom-solid/Hooks"
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { createEffect, createMemo, createSignal, getOwner, on, runWithOwner, type Accessor } from "solid-js"
import { useChanges } from "../api/changes.ts"
import { workspaceFailure } from "../api/failures.ts"
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts"
import { toDate } from "../conversations/time.ts"
import { memberName } from "../conversations/views.ts"
import { useWorkspaceClient } from "../provider.tsx"
import { useTurnActivity } from "../turns/views.ts"
import {
  agentsFailure,
  agentsReads,
  changeAgent,
  issueOf,
  newAgentRequestKey,
  reloadAgents,
  type Agent,
  type AgentCommand,
  type Connection,
  type AgentsReads,
  type SetupInput
} from "./api.ts"

/** The harness choice that lets amends choose one as the agent works, as the setup fields name it. */
const auto = "auto"
/** The role a new agent starts with, unless the reader chooses another. */
const memberRole = "builtin:member"
/** No agent holds the owner's role. */
const ownerRole = "builtin:owner"

/** A change that completed and whose result is shown. */
export interface AgentsDone {
  readonly action: AgentsAction
  /** The agent it concerned, by name. */
  readonly subject?: string
  /** The agent it created. */
  readonly created?: string
}

/** How an agent is set up, as its form edits it. */
interface SetupDraft {
  readonly instructions: string
  /** `auto`, or a harness connection's ID. */
  readonly harness: string
  readonly modelConnectionId: string | undefined
  readonly model: string
  readonly effort?: Effort
  readonly sandboxId?: string
}

const blankSetup: SetupDraft = {
  instructions: "",
  harness: auto,
  modelConnectionId: undefined,
  model: ""
}

const draftOf = (view: Agent.View): SetupDraft => ({
  instructions: view.instructions,
  harness: view.harness._tag === "Auto" ? auto : view.harness.connectionId,
  modelConnectionId: view.model.connectionId,
  model: view.model.id,
  ...(view.model.effort === undefined ? {} : { effort: view.model.effort }),
  ...(view.sandbox === null ? {} : { sandboxId: view.sandbox.connectionId })
})

/** The setup a draft sends, once it names a model. */
const inputOf = (draft: SetupDraft): SetupInput | undefined =>
  draft.modelConnectionId === undefined || draft.model.trim() === ""
    ? undefined
    : {
        instructions: draft.instructions.trim(),
        harnessId: draft.harness === auto ? undefined : draft.harness,
        model: {
          connectionId: draft.modelConnectionId,
          id: draft.model.trim(),
          ...(draft.effort === undefined ? {} : { effort: draft.effort })
        },
        sandboxId: draft.sandboxId
      }

const sameSetup = (left: SetupDraft, right: SetupDraft) =>
  JSON.stringify(inputOf(left)) === JSON.stringify(inputOf(right))

type SetupKey = keyof SetupDraft

/** The draft field that chooses each part's connection. */
const connectionKey = {
  harness: "harness",
  model: "modelConnectionId",
  sandbox: "sandboxId"
} as const satisfies Record<SetupPart, SetupKey>

/** The draft fields whose edit may resolve an issue. */
const resolvingKeys = (issue: AgentIssue): ReadonlyArray<SetupKey> => {
  switch (issue.kind) {
    case "sandbox-required":
      return ["harness", "sandboxId"]
    case "no-harness":
      return ["harness"]
    case "invalid":
      return issue.part === "model" ? ["modelConnectionId", "model", "effort"] : [connectionKey[issue.part]]
    case "removed":
    case "uninstalled":
      return [connectionKey[issue.part]]
  }
}

type Problem = Omit<AgentsFailure, "action" | "error">

/**
 * What a refused setup still shows once the reader has edited `edited`: an issue stops showing as
 * a field that may resolve it changes, and a refusal with none left is set aside.
 */
const remainingProblem = (problem: Problem, edited: ReadonlySet<SetupKey>): Problem | undefined => {
  if (problem.part !== undefined && edited.has(connectionKey[problem.part])) return undefined
  if (problem.issues === undefined || problem.issues.length === 0) return problem
  const issues = problem.issues.filter((issue) => !resolvingKeys(issue).some((key) => edited.has(key)))
  return issues.length === 0 ? undefined : { ...problem, issues }
}

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined

/** One of an agent's turns in progress, with the thread its log opens beside, for its href. */
export interface AgentTurnEntry extends Omit<AgentTurn, "href"> {
  readonly groupId: string
  readonly threadId: string
}

/** An agent as the Agents sidebar lists it. */
export interface AgentListEntry {
  readonly id: string
  readonly memberId: string
  readonly name: string
  readonly issues: ReadonlyArray<AgentIssue>
  /** Where it is at work; unset while it is idle. */
  readonly activity?: AgentActivity
}

/**
 * A workspace's agents by name, for navigation, live while mounted. It shares the page's reads.
 * `canCreate` says whether the reader may add one.
 */
export function useAgentList(workspaceId: string) {
  const reads = agentsReads(useWorkspaceClient(workspaceId), workspaceId)
  const agents = reads ? useAtomValue(() => reads.agents) : undefined
  const canCreate = useWorkspacePermission(workspaceId, "agent.create")
  const turnActivity = useTurnActivity(workspaceId)
  const entries = createMemo((): ReadonlyArray<AgentListEntry> | undefined =>
    Option.getOrUndefined(
      Option.map(AsyncResult.value(agents?.() ?? AsyncResult.initial()), (views) =>
        views.map((view) => {
          const activity = turnActivity.agentActivity(view.memberId)
          return {
            id: view.id,
            memberId: view.memberId,
            name: view.name,
            issues: view.readiness._tag === "Ready" ? [] : view.readiness.issues.map(issueOf),
            ...(activity === undefined ? {} : { activity })
          }
        })
      )
    )
  )
  return {
    agents: () => entries() ?? [],
    /** Nothing has loaded yet, so an empty list says nothing. */
    loading: () => entries() === undefined,
    canCreate: () => canCreate() === true
  }
}

/**
 * A workspace's agents, live while mounted: each as its page shows it, with the connections its
 * setup names; the choices a setup offers, with the models each connection offers; and the changes
 * the reader may make. A connection an agent names that is removed, not installed, or no longer
 * gives its part stays among the choices, marked unavailable. Drafts keep what they were made
 * against: a rename saved elsewhere meanwhile conflicts instead of being overwritten. `done` hears
 * each change once its result is shown.
 */
export function useAgents(workspaceId: string, options: { readonly done?: (done: AgentsDone) => void } = {}) {
  const reads = agentsReads(useWorkspaceClient(workspaceId), workspaceId)
  const canCreate = useWorkspacePermission(workspaceId, "agent.create")
  const members = useMembers(workspaceId)
  const turnActivity = useTurnActivity(workspaceId)
  const read = reads ? connect(reads) : undefined
  const loaded = () =>
    read?.agents() !== undefined && read.connections() !== undefined && read.integrations() !== undefined

  // Connections by ID, with what their integration gives, as a setup's choices offer them.
  const integrations = createMemo(
    () => new Map((read?.integrations() ?? []).map((integration) => [integration.id, integration]))
  )
  const connections = createMemo(
    () => new Map((read?.connections() ?? []).map((connection) => [connection.id, connection]))
  )
  const capabilities = { harness: "harnesses", model: "models", sandbox: "sandboxes" } as const
  /** Why a connection can't give `part`, or nothing when it can. */
  const unavailable = (connectionId: string, part: SetupPart): string | undefined => {
    const connection = connections().get(connectionId as Connection.Id)
    if (!connection) return "This connection was removed."
    const integration = integrations().get(connection.integration)
    if (!integration) return "Its integration isn’t installed on this host."
    if (!integration.provides.includes(capabilities[part])) return `${integration.name} gives no ${capabilities[part]}.`
    if (connection.readiness._tag === "Invalid") return connection.readiness.description
    return undefined
  }
  const optionsFor = (part: SetupPart, current: string | undefined): ReadonlyArray<ConnectionOption> => {
    const offered = (read?.connections() ?? []).flatMap((connection) => {
      const integration = integrations().get(connection.integration)
      if (!integration?.provides.includes(capabilities[part])) return []
      const why = unavailable(connection.id, part)
      return [
        {
          id: connection.id,
          name: connection.name,
          integrationName: integration.name,
          ...(why === undefined ? {} : { unavailable: why })
        }
      ]
    })
    if (current === undefined || current === auto || offered.some((option) => option.id === current)) return offered
    const connection = connections().get(current as Connection.Id)
    return [
      ...offered,
      {
        id: current,
        name: connection?.name ?? "Removed connection",
        integrationName:
          (connection && integrations().get(connection.integration)?.name) ?? connection?.integration ?? "",
        unavailable: unavailable(current, part) ?? "This connection can’t be chosen."
      }
    ]
  }
  const harnessOptions = (current: string | undefined): ReadonlyArray<HarnessOption> =>
    optionsFor("harness", current).map((option) => {
      const connection = connections().get(option.id as Connection.Id)
      const integration = connection && integrations().get(connection.integration)
      return Object.assign({}, option, { requiresSandbox: integration?.requiresSandbox ?? false })
    })

  // The models each connection offers, read once a setup names it and live while mounted.
  const owner = getOwner()
  const modelReads = new Map<string, Accessor<ModelChoices>>()
  const models = (connectionId: string | undefined): ModelChoices | undefined => {
    if (!reads || connectionId === undefined || unavailable(connectionId, "model") !== undefined) return undefined
    let modelRead = modelReads.get(connectionId)
    if (!modelRead) {
      modelRead = runWithOwner(owner, () => modelChoices(reads, connectionId as Connection.Id))!
      modelReads.set(connectionId, modelRead)
    }
    return modelRead()
  }

  const connectionOf = (connectionId: string): SetupConnection => {
    const connection = connections().get(connectionId as Connection.Id)
    return connection === undefined ? { id: connectionId } : { id: connectionId, name: connection.name }
  }
  const summaryOf = (view: Agent.View): AgentSummary => {
    const offered = models(view.model.connectionId)
    const listed = offered?.status === "loaded" ? offered.listed.find((model) => model.id === view.model.id) : undefined
    const activity = turnActivity.agentActivity(view.memberId)
    return {
      id: view.id,
      memberId: view.memberId,
      name: view.name,
      instructions: view.instructions,
      harness:
        view.harness._tag === "Auto"
          ? { kind: "auto" }
          : Object.assign({ kind: "connection" as const }, connectionOf(view.harness.connectionId)),
      model: {
        connection: connectionOf(view.model.connectionId),
        id: view.model.id,
        ...(listed === undefined ? {} : { name: listed.name }),
        ...(view.model.effort === undefined ? {} : { effort: view.model.effort })
      },
      ...(view.sandbox === null ? {} : { sandbox: connectionOf(view.sandbox.connectionId) }),
      issues: view.readiness._tag === "Ready" ? [] : view.readiness.issues.map(issueOf),
      configurable: view.configurable,
      createdBy: memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt),
      ...(activity === undefined ? {} : { activity })
    }
  }
  /** The agent's turns in progress, as its page lists them. */
  const turnsOf = (memberId: string): ReadonlyArray<AgentTurnEntry> =>
    turnActivity.ofAgent(memberId).flatMap((turn) =>
      turn.state === "queued" || turn.state === "working" || turn.state === "stopping"
        ? [
            {
              id: turn.id,
              state: turn.state,
              place: turn.place,
              groupId: turn.groupId,
              threadId: turn.threadId
            }
          ]
        : []
    )
  const views = createMemo(() => read?.agents() ?? [])
  const all = createMemo(() => views().map(summaryOf))
  const find = (agentId: string) => all().find((entry) => entry.id === agentId)
  const viewOf = (agentId: string) => views().find((entry) => entry.id === agentId)

  /** The roles a new agent may start with; only those marked assignable can be given. */
  const roles = createMemo((): ReadonlyArray<AgentRoleOption> =>
    (read?.settings()?.roles ?? []).flatMap((choice) =>
      choice.role.id === ownerRole
        ? []
        : [{ id: choice.role.id, name: choice.role.name, assignable: choice.assignable }]
    )
  )

  const changes = useChanges({
    workspaceId,
    write: changeAgent,
    reload: reads ? reloadAgents(reads) : Effect.void,
    failed: (cause) => {
      const { error, ...problem } = agentsFailure(cause)
      return { error, problems: [problem] }
    },
    done: (change: AgentCommand, created, details: { readonly subject?: string } | undefined) => {
      if (change.kind === "create") {
        intent = undefined
        setCreating(undefined)
      }
      if (change.kind === "rename") forget(setNames, change.agentId)
      if (change.kind === "configure") forget(setSetups, change.agentId)
      options.done?.({
        action: change.kind,
        ...(details?.subject === undefined ? {} : { subject: details.subject }),
        ...(created === undefined ? {} : { created })
      })
    },
    outdated: () => loaded() && read?.failure() !== undefined
  })
  // The setup fields edited since the last change was sent; the issues they may resolve stop showing.
  const [edited, setEdited] = createSignal<ReadonlySet<SetupKey>>(new Set())
  const send: typeof changes.send = (change, details) => {
    setEdited(new Set<SetupKey>())
    changes.send(change, details)
  }

  // A new agent: its name, its role, and its setup. Retrying the same request reuses its request
  // key, so an attempt whose response was lost is not created twice; changing it makes a new one.
  const [creating, setCreating] = createSignal<{
    readonly name: string
    readonly roleId: string | undefined
    readonly setup: SetupDraft
  }>()
  let intent: { readonly body: string; readonly key: ReturnType<typeof newAgentRequestKey> } | undefined
  const createRole = () => {
    const chosen = roles().find((role) => role.id === creating()?.roleId && role.assignable)
    return (chosen ?? roles().find((role) => role.id === memberRole && role.assignable))?.id
  }

  // Per agent: a rename keeps the name it was made against; a setup keeps its edits.
  const [names, setNames] = createSignal<
    Readonly<Record<string, { readonly name: string; readonly expected: string }>>
  >({})
  const [setups, setSetups] = createSignal<Readonly<Record<string, SetupDraft>>>({})
  const forget = <A>(
    set: (update: (previous: Readonly<Record<string, A>>) => Readonly<Record<string, A>>) => void,
    agentId: string
  ) => set((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== agentId)))
  const savedSetup = (agentId: string) => {
    const view = viewOf(agentId)
    return view ? draftOf(view) : undefined
  }
  const setupOf = (agentId: string) => setups()[agentId] ?? savedSetup(agentId) ?? blankSetup

  // After an explicit refresh, rename drafts stay and are made against the name now shown.
  createEffect(
    on(
      changes.revision,
      () =>
        setNames((previous) =>
          Object.fromEntries(
            Object.entries(previous).map(([id, edit]) => [id, { ...edit, expected: find(id)?.name ?? edit.expected }])
          )
        ),
      { defer: true }
    )
  )

  /** The setup fields over a draft, which `edit` changes. */
  const fieldsOf = (
    draft: SetupDraft,
    apply: (change: Partial<SetupDraft>) => void
  ): Omit<SetupFieldsProps, "problems" | "disabled"> => {
    const edit = (change: Partial<SetupDraft>) => {
      setEdited((previous) => new Set([...previous, ...(Object.keys(change) as Array<SetupKey>)]))
      apply(change)
    }
    return {
      instructions: draft.instructions,
      onInstructionsChange: (instructions) => edit({ instructions }),
      harness: draft.harness,
      onHarnessChange: (harness) => edit({ harness }),
      harnesses: harnessOptions(draft.harness),
      modelConnections: optionsFor("model", draft.modelConnectionId),
      modelConnectionId: draft.modelConnectionId,
      onModelConnectionChange: (modelConnectionId) => edit({ modelConnectionId, model: "", effort: undefined }),
      models: models(draft.modelConnectionId),
      model: draft.model,
      onModelChange: (model) => edit({ model }),
      effort: draft.effort,
      onEffortChange: (effort) => edit({ effort }),
      sandboxes: optionsFor("sandbox", draft.sandboxId),
      sandboxId: draft.sandboxId,
      onSandboxChange: (sandboxId) => edit({ sandboxId })
    }
  }
  return {
    /** Why nothing shows yet; undefined once the agents have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (loaded()) return undefined
      if (!read) return "unavailable"
      const failure = read.failure()
      if (failure === undefined) return "loading"
      return failure === "denied" || failure === "gone" ? "unavailable" : "failed"
    },
    /** Every agent the reader may read, by name. */
    agents: all,
    agent: find,
    /** An agent's turns in progress, by its member ID, as its page lists them. */
    turnsOf,
    /** The reader may add agents. */
    canCreate: () => canCreate() === true,
    /** The roles a new agent may start with. */
    roles,
    /** The change running, or `refresh`. */
    pending: changes.pending,
    /** The last change's failure, or a refresh's. */
    failure: (): AgentsFailure | undefined => {
      const failure = changes.failure()
      if (!failure) return undefined
      const [problem] = failure.problems
      const remaining = problem && remainingProblem(problem, edited())
      if (problem && !remaining) return undefined
      return Object.assign({ action: failure.action, error: failure.error }, remaining)
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: changes.stale,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry()
      else changes.refresh()
    },
    /** Set aside the last change's failure, as a dialog closes. */
    dismiss: () => {
      if (!changes.pending()) changes.dismiss()
    },
    create: {
      /** Start a new agent, with Member as its role when the reader may give it. */
      begin: () => {
        changes.dismiss()
        intent = undefined
        setCreating({ name: "", roleId: undefined, setup: blankSetup })
      },
      name: () => creating()?.name ?? "",
      setName: (name: string) => setCreating((current) => current && { ...current, name }),
      roleId: createRole,
      setRole: (roleId: string) => setCreating((current) => current && { ...current, roleId }),
      /** The setup fields over the new agent's draft. */
      fields: () =>
        fieldsOf(creating()?.setup ?? blankSetup, (edit) =>
          setCreating((current) => current && { ...current, setup: Object.assign({}, current.setup, edit) })
        ),
      /** The draft has a name, a role the reader may give, and a model. */
      ready: () => {
        const current = creating()
        return (
          current !== undefined &&
          current.name.trim() !== "" &&
          createRole() !== undefined &&
          inputOf(current.setup) !== undefined
        )
      },
      save: () => {
        const current = creating(),
          roleId = createRole(),
          setup = current && inputOf(current.setup)
        if (!current || !roleId || !setup) return
        const body = { name: current.name.trim(), roleId, setup }
        const serialized = JSON.stringify(body)
        if (intent?.body !== serialized) intent = { body: serialized, key: newAgentRequestKey() }
        send({ kind: "create", ...body, key: intent.key }, { subject: body.name })
      },
      cancel: () => {
        intent = undefined
        setCreating(undefined)
      }
    },
    setup: {
      /** The setup fields over the agent's draft, its saved setup until it is edited. */
      fields: (agentId: string) =>
        fieldsOf(setupOf(agentId), (edit) =>
          setSetups((previous) => ({
            ...previous,
            [agentId]: Object.assign({}, setupOf(agentId), edit)
          }))
        ),
      /** The setup differs from the saved one, names a model, and can be saved now. */
      changed: (agentId: string) => {
        const edit = setups()[agentId],
          saved = savedSetup(agentId)
        return (
          !changes.stale() &&
          edit !== undefined &&
          saved !== undefined &&
          inputOf(edit) !== undefined &&
          !sameSetup(edit, saved)
        )
      },
      save: (agentId: string) => {
        const edit = setups()[agentId],
          setup = edit && inputOf(edit)
        if (setup) send({ kind: "configure", agentId, setup }, { subject: find(agentId)?.name })
      },
      /** Put the saved setup back in place of the edits. */
      discard: (agentId: string) => {
        if (changes.attempt()?.action === "configure") changes.dismiss()
        forget(setSetups, agentId)
      }
    },
    rename: {
      name: (agentId: string) => names()[agentId]?.name ?? find(agentId)?.name ?? "",
      setName: (agentId: string, name: string) =>
        setNames((previous) => ({
          ...previous,
          [agentId]: { name, expected: previous[agentId]?.expected ?? find(agentId)?.name ?? "" }
        })),
      /** The name differs from the one saved and can be saved now. */
      changed: (agentId: string) => {
        const name = names()[agentId]?.name.trim()
        return !changes.stale() && name !== undefined && name !== "" && name !== find(agentId)?.name
      },
      save: (agentId: string) => {
        const edit = names()[agentId]
        if (edit)
          send(
            { kind: "rename", agentId, name: edit.name.trim(), expectedName: edit.expected },
            { subject: edit.name.trim() }
          )
      }
    },
    /** Discard an agent's unsaved name and setup, such as when its page closes. */
    reset: (agentId: string) => {
      forget(setNames, agentId)
      forget(setSetups, agentId)
    },
    /** Remove the agent from the workspace, ending its membership. */
    remove: (agentId: string) => {
      const agent = find(agentId)
      if (agent) send({ kind: "remove", agentId, memberId: agent.memberId }, { subject: agent.name })
    }
  }
}
export type AgentsView = ReturnType<typeof useAgents>

/** The models a connection offers, as the setup's model field suggests them. */
function modelChoices(reads: AgentsReads, connectionId: Connection.Id): Accessor<ModelChoices> {
  const result = useAtomValue(() => reads.models(connectionId))
  return () => {
    const current = result()
    const value = AsyncResult.value(current)
    if (Option.isSome(value))
      return {
        status: "loaded",
        listed: value.value.listed.map((model) => ({
          id: model.id,
          name: model.name,
          efforts: model.reasoning?.efforts ?? []
        })),
        unlisted: value.value.unlisted
      }
    return settled(current) === undefined ? { status: "loading" } : { status: "failed" }
  }
}

function connect(reads: AgentsReads) {
  const agents = useAtomValue(() => reads.agents),
    connections = useAtomValue(() => reads.connections),
    integrations = useAtomValue(() => reads.integrations),
    settings = useAtomValue(() => reads.settings),
    retryAgents = useAtomRefresh(() => reads.agents),
    retryConnections = useAtomRefresh(() => reads.connections),
    retryIntegrations = useAtomRefresh(() => reads.integrations)
  return {
    agents: () => Option.getOrUndefined(AsyncResult.value(agents())),
    connections: () => Option.getOrUndefined(AsyncResult.value(connections())),
    integrations: () => Option.getOrUndefined(AsyncResult.value(integrations())),
    settings: () => Option.getOrUndefined(AsyncResult.value(settings())),
    /** Why the latest read failed, once it settles. */
    failure: () => {
      const cause = settled(agents()) ?? settled(connections()) ?? settled(integrations())
      return cause === undefined ? undefined : workspaceFailure(cause)
    },
    retry: () => {
      retryAgents()
      retryConnections()
      retryIntegrations()
    }
  }
}
