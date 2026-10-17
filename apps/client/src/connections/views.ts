import type {
  AuthMethod,
  ConnectionHealth,
  ConnectionReadiness,
  ConnectionSummary,
  ConnectionsAction,
  ConnectionsFailure,
  IntegrationCapability,
  IntegrationOption
} from "@amends-dev/ui/screens/connections"
import { useAtomRefresh, useAtomValue } from "@effect/atom-solid/Hooks"
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { createEffect, createMemo, createSignal, on } from "solid-js"
import { useChanges } from "../api/changes.ts"
import { workspaceFailure } from "../api/failures.ts"
import { useWorkspaceMutation, newRequestKey, type RequestKey } from "../api/mutation.ts"
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts"
import { toDate } from "../conversations/time.ts"
import { memberName } from "../conversations/views.ts"
import { useWorkspaceClient } from "../provider.tsx"
import {
  changeConnection,
  checkConnection,
  connectionsFailure,
  connectionsReads,
  reloadConnections,
  Connection,
  type ConnectionCommand,
  type ConnectionsReads
} from "./api.ts"
import { fieldIssue, fieldsOf, settingsComplete, settingsOf, textsOf } from "./settings.ts"

/** A change that completed and whose result is shown. */
export interface ConnectionsDone {
  readonly action: Exclude<ConnectionsAction, "check">
  /** The connection it concerned, by name. */
  readonly subject?: string
  /** The connection it created. */
  readonly created?: string
}

const readinessOf = Connection.Readiness.match<ConnectionReadiness>({
  Ready: () => ({ state: "ready" }),
  Invalid: ({ description }) => ({ state: "invalid", description }),
  Uninstalled: () => ({ state: "uninstalled" })
})

const integrationOf = (view: Connection.IntegrationView): IntegrationOption => ({
  id: view.id,
  name: view.name,
  ...(view.docs === undefined ? {} : { docs: view.docs }),
  provides: view.provides,
  auth: view.auth,
  fields: fieldsOf(view.settings)
})

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined

/** A connection as the Connections sidebar lists it. */
export interface ConnectionListEntry {
  readonly id: string
  readonly name: string
  /** What its integration gives; none once this host no longer installs it. */
  readonly provides: ReadonlyArray<IntegrationCapability>
  readonly readiness: ConnectionReadiness
}

/**
 * A workspace's connections by name and what they give, for navigation, live while mounted. It
 * shares the page's reads. `canCreate` says whether the reader may add one.
 */
export function useConnectionList(workspaceId: string) {
  const reads = connectionsReads(useWorkspaceClient(workspaceId), workspaceId)
  const read = reads ? connect(reads) : undefined
  const canCreate = useWorkspacePermission(workspaceId, "connection.create")
  const connections = createMemo((): ReadonlyArray<ConnectionListEntry> | undefined => {
    const views = read?.connections()
    if (views === undefined) return undefined
    const provides = new Map((read?.integrations() ?? []).map((integration) => [integration.id, integration.provides]))
    return views.map((view) => ({
      id: view.id,
      name: view.name,
      provides: provides.get(view.integration) ?? [],
      readiness: readinessOf(view.readiness)
    }))
  })
  return {
    connections: () => connections() ?? [],
    /** Nothing has loaded yet, so an empty list says nothing. */
    loading: () => connections() === undefined,
    canCreate: () => canCreate() === true
  }
}

/**
 * A workspace's connections, live while mounted: the integrations this host installs with the
 * fields their settings forms ask for, each connection as its page shows it, and the changes the
 * reader may make. Creating sends the key with the connection, then checks it. Drafts keep what
 * they were made against: a rename saved elsewhere meanwhile conflicts instead of being
 * overwritten. A check's result stays while mounted. `done` hears each change once its result is
 * shown.
 */
export function useConnections(workspaceId: string, options: { readonly done?: (done: ConnectionsDone) => void } = {}) {
  const reads = connectionsReads(useWorkspaceClient(workspaceId), workspaceId)
  const canCreate = useWorkspacePermission(workspaceId, "connection.create")
  const members = useMembers(workspaceId)
  const read = reads ? connect(reads) : undefined

  const integrations = createMemo(() => (read?.integrations() ?? []).map(integrationOf))
  const integrationById = createMemo(() => new Map(integrations().map((integration) => [integration.id, integration])))
  const summaryOf = (view: Connection.View): ConnectionSummary => {
    const integration = integrationById().get(view.integration)
    return {
      id: view.id,
      name: view.name,
      integrationId: view.integration,
      integration: integration && {
        name: integration.name,
        ...(integration.docs === undefined ? {} : { docs: integration.docs }),
        provides: integration.provides
      },
      fields: integration?.fields ?? [],
      settings: textsOf(view.settings),
      auth: view.auth,
      readiness: readinessOf(view.readiness),
      manageable: view.manageable,
      createdBy: memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt)
    }
  }
  const all = createMemo(() => (read?.connections() ?? []).map(summaryOf))
  const find = (connectionId: string) => all().find((entry) => entry.id === connectionId)
  const loaded = () => read?.connections() !== undefined && read.integrations() !== undefined

  const changes = useChanges({
    workspaceId,
    write: changeConnection,
    reload: reads ? reloadConnections(reads) : Effect.void,
    failed: (cause) => {
      const failure = connectionsFailure(cause)
      return {
        error: failure.error,
        problems: failure.description === undefined ? [] : [failure.description]
      }
    },
    done: (change: ConnectionCommand, created, details: { readonly subject?: string } | undefined) => {
      if (change.kind === "create") {
        intent = undefined
        setDraft(undefined)
        setNewKey("")
        if (created !== undefined) void check(created)
      }
      if (change.kind === "rename") forget(setNames, change.connectionId)
      if (change.kind === "configure") forget(setEdits, change.connectionId)
      if (change.kind === "replace-key") setReplacement("")
      options.done?.({
        action: change.kind,
        ...(details?.subject === undefined ? {} : { subject: details.subject }),
        ...(created === undefined ? {} : { created })
      })
    },
    outdated: () => loaded() && read?.failure() !== undefined
  })
  const send = changes.send

  // Checks run beside changes: each asks the connection's system, stores nothing, and keeps its
  // result, or why it could not run, with the connection it checked.
  const checking = useWorkspaceMutation(workspaceId, checkConnection)
  const [checkingId, setCheckingId] = createSignal<string>()
  const [health, setHealth] = createSignal<Readonly<Record<string, ConnectionHealth>>>({})
  const [checkFailure, setCheckFailure] = createSignal<{
    readonly connectionId: string
    readonly failure: ConnectionsFailure
  }>()
  async function check(connectionId: string) {
    if (checkingId() !== undefined) return
    setCheckFailure(undefined)
    setCheckingId(connectionId)
    const exit = await checking.run(connectionId)
    setCheckingId(undefined)
    if (exit === undefined) return
    if (Exit.isSuccess(exit)) setHealth((previous) => ({ ...previous, [connectionId]: exit.value }))
    else
      setCheckFailure({
        connectionId,
        failure: { action: "check", ...connectionsFailure(exit.cause) }
      })
  }

  // A new connection: its integration, name, settings as their fields' text, how it
  // authenticates, and its key. Retrying the same request reuses its request key, so an attempt
  // whose response was lost is not created twice; changing the key makes it a new request.
  const [draft, setDraft] = createSignal<{
    readonly integrationId: string
    readonly name: string
    readonly texts: Readonly<Record<string, string>>
    readonly auth: AuthMethod
  }>()
  const [newKey, setNewKey] = createSignal("")
  let intent: { readonly body: string; readonly key: RequestKey } | undefined
  const draftIntegration = () => {
    const current = draft()
    return current && integrationById().get(current.integrationId)
  }

  // Per connection: a rename keeps the name it was made against; settings keep their text.
  const [names, setNames] = createSignal<
    Readonly<Record<string, { readonly name: string; readonly expected: string }>>
  >({})
  const [edits, setEdits] = createSignal<Readonly<Record<string, Readonly<Record<string, string>>>>>({})
  const forget = <A>(
    set: (update: (previous: Readonly<Record<string, A>>) => Readonly<Record<string, A>>) => void,
    connectionId: string
  ) => set((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== connectionId)))
  // The key being entered in place of a connection's key, kept only until it saves or its dialog
  // closes.
  const [replacement, setReplacement] = createSignal("")

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

  const textsFor = (entry: ConnectionSummary) => edits()[entry.id] ?? entry.settings

  return {
    /** Why nothing shows yet; undefined once the connections have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (loaded()) return undefined
      if (!read) return "unavailable"
      const failure = read.failure()
      if (failure === undefined) return "loading"
      return failure === "denied" || failure === "gone" ? "unavailable" : "failed"
    },
    /** The integrations this host installs. */
    integrations,
    /** Every connection, by name. */
    connections: all,
    connection: find,
    /** The reader may add connections. */
    canCreate: () => canCreate() === true,
    /** The change or check running, or `refresh`. */
    pending: (): ConnectionsAction | "refresh" | undefined =>
      changes.pending() ?? (checkingId() === undefined ? undefined : "check"),
    /** The last change's failure, or a refresh's. */
    failure: (): ConnectionsFailure | undefined => {
      const failure = changes.failure()
      return (
        failure && {
          action: failure.action,
          error: failure.error,
          ...(failure.problems[0] === undefined ? {} : { description: failure.problems[0] })
        }
      )
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: changes.stale,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry()
      else changes.refresh()
    },
    /** Set aside the last change's failure and any key being entered, as a dialog closes. */
    dismiss: () => {
      if (changes.pending()) return
      changes.dismiss()
      setNewKey("")
      setReplacement("")
    },
    create: {
      /** Start a connection through an integration, named after it. */
      begin: (integrationId: string) => {
        const integration = integrationById().get(integrationId)
        if (!integration) return
        changes.dismiss()
        intent = undefined
        setNewKey("")
        setDraft({
          integrationId,
          name: integration.name,
          texts: {},
          auth: integration.auth[0] ?? "none"
        })
      },
      integration: draftIntegration,
      name: () => draft()?.name ?? "",
      setName: (name: string) => setDraft((current) => current && { ...current, name }),
      value: (key: string) => draft()?.texts[key] ?? "",
      setValue: (key: string, value: string) =>
        setDraft((current) => current && { ...current, texts: { ...current.texts, [key]: value } }),
      /** Why a setting's text would be refused, once there is any. */
      issue: (key: string) => {
        const field = draftIntegration()?.fields.find((candidate) => candidate.key === key)
        return field && fieldIssue(field, draft()?.texts[key] ?? "")
      },
      auth: (): AuthMethod => draft()?.auth ?? "none",
      setAuth: (auth: AuthMethod) => setDraft((current) => current && { ...current, auth }),
      apiKey: newKey,
      setApiKey: (apiKey: string) => {
        intent = undefined
        setNewKey(apiKey)
      },
      /** The draft has a name, every required, well-formed setting, and its key if it takes one. */
      ready: () => {
        const current = draft(),
          integration = draftIntegration()
        return (
          current !== undefined &&
          integration !== undefined &&
          current.name.trim() !== "" &&
          settingsComplete(integration.fields, current.texts) &&
          (current.auth === "none" || newKey().trim() !== "")
        )
      },
      save: () => {
        const current = draft(),
          integration = draftIntegration()
        if (!current || !integration) return
        const body = {
          integration: current.integrationId,
          name: current.name.trim(),
          settings: settingsOf(integration.fields, current.texts),
          auth: current.auth
        }
        const serialized = JSON.stringify(body)
        if (intent?.body !== serialized) intent = { body: serialized, key: newRequestKey() }
        send(
          {
            kind: "create",
            ...body,
            ...(current.auth === "apiKey" ? { apiKey: newKey().trim() } : {}),
            key: intent.key
          },
          { subject: body.name }
        )
      },
      cancel: () => {
        intent = undefined
        setNewKey("")
        setDraft(undefined)
      }
    },
    rename: {
      name: (connectionId: string) => names()[connectionId]?.name ?? find(connectionId)?.name ?? "",
      setName: (connectionId: string, name: string) =>
        setNames((previous) => ({
          ...previous,
          [connectionId]: {
            name,
            expected: previous[connectionId]?.expected ?? find(connectionId)?.name ?? ""
          }
        })),
      /** The name differs from the one saved and can be saved now. */
      changed: (connectionId: string) => {
        const name = names()[connectionId]?.name.trim()
        return !changes.stale() && name !== undefined && name !== "" && name !== find(connectionId)?.name
      },
      save: (connectionId: string) => {
        const edit = names()[connectionId]
        if (edit)
          send(
            { kind: "rename", connectionId, name: edit.name.trim(), expectedName: edit.expected },
            { subject: edit.name.trim() }
          )
      }
    },
    configure: {
      value: (connectionId: string, key: string) => {
        const entry = find(connectionId)
        return entry ? (textsFor(entry)[key] ?? "") : ""
      },
      setValue: (connectionId: string, key: string, value: string) => {
        const entry = find(connectionId)
        if (entry)
          setEdits((previous) => ({
            ...previous,
            [connectionId]: { ...textsFor(entry), [key]: value }
          }))
      },
      issue: (connectionId: string, key: string) => {
        const entry = find(connectionId)
        const field = entry?.fields.find((candidate) => candidate.key === key)
        return entry && field && fieldIssue(field, textsFor(entry)[key] ?? "")
      },
      /** The settings differ from those saved, and can be saved now. */
      changed: (connectionId: string) => {
        const entry = find(connectionId),
          edit = edits()[connectionId]
        if (!entry || !edit || changes.stale() || !settingsComplete(entry.fields, edit)) return false
        return (
          JSON.stringify(settingsOf(entry.fields, edit)) !== JSON.stringify(settingsOf(entry.fields, entry.settings))
        )
      },
      save: (connectionId: string) => {
        const entry = find(connectionId),
          edit = edits()[connectionId]
        if (entry && edit)
          send({ kind: "configure", connectionId, settings: settingsOf(entry.fields, edit) }, { subject: entry.name })
      },
      /** Discard unsaved settings and name, such as when the page closes. */
      reset: (connectionId: string) => {
        forget(setEdits, connectionId)
        forget(setNames, connectionId)
      }
    },
    key: {
      apiKey: replacement,
      setApiKey: setReplacement,
      /** Save the key entered for a connection in place of its key. */
      save: (connectionId: string) => {
        const apiKey = replacement().trim()
        if (apiKey !== "") send({ kind: "replace-key", connectionId, apiKey }, { subject: find(connectionId)?.name })
      }
    },
    check: {
      /** Ask the connection's system whether it works as set up. */
      run: (connectionId: string) => void check(connectionId),
      /** It is being checked now. */
      running: (connectionId: string) => checkingId() === connectionId,
      /** What its last check found, while mounted. */
      health: (connectionId: string) => health()[connectionId],
      /** Why its last check could not run. */
      failure: (connectionId: string) => {
        const failure = checkFailure()
        return failure?.connectionId === connectionId ? failure.failure : undefined
      }
    },
    remove: (connectionId: string) => send({ kind: "remove", connectionId }, { subject: find(connectionId)?.name })
  }
}
export type ConnectionsView = ReturnType<typeof useConnections>

function connect(reads: ConnectionsReads) {
  const connections = useAtomValue(() => reads.connections),
    integrations = useAtomValue(() => reads.integrations),
    retryConnections = useAtomRefresh(() => reads.connections),
    retryIntegrations = useAtomRefresh(() => reads.integrations)
  return {
    connections: () => Option.getOrUndefined(AsyncResult.value(connections())),
    integrations: () => Option.getOrUndefined(AsyncResult.value(integrations())),
    /** Why the latest read failed, once it settles. */
    failure: () => {
      const cause = settled(connections()) ?? settled(integrations())
      return cause === undefined ? undefined : workspaceFailure(cause)
    },
    retry: () => {
      retryConnections()
      retryIntegrations()
    }
  }
}
