import type {
  ConnectionCapability,
  ConnectionMethod,
  ConnectionProviderOption,
  ConnectionSettingField,
  ConnectionSetup,
  ConnectionSummary,
  ConnectionsAction,
  ConnectionsFailure,
  SettingIssue,
} from "@amends/ui/screens/connections";
import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Cause, Effect, Option, Predicate } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { useApiClient } from "../provider.tsx";
import {
  changeConnection,
  connectionsReads,
  credentialsUnavailable,
  newConnectionRequestKey,
  Connection,
  type ConnectionCommand,
  ConnectionImplementation,
  type ConnectionsReads,
  reloadConnections,
} from "./api.ts";
import { useChanges } from "../api/changes.ts";
import { workspaceFailure } from "../api/failures.ts";
import { toDate } from "../conversations/time.ts";
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts";
import { memberName } from "../conversations/views.ts";

/** A change that completed and whose result is shown. */
export interface ConnectionsDone {
  readonly action: ConnectionsAction;
  /** The connection it concerned, by name. */
  readonly subject?: string;
  /** The connection it created. */
  readonly created?: string;
  /** How the created connection authenticates, so its key can be asked for next. */
  readonly method?: ConnectionMethod;
}

const isUrl = /^https?:\/\/[^\s/?#]+[^\s]*$/;
const isWholeNumber = /^[1-9]\d{0,14}$/;
/**
 * A value the setting would refuse: a URL that is not http or https, or a count that is not a
 * whole number above zero.
 */
const settingIssue = (setting: ConnectionSettingField, value: string): SettingIssue | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (setting.kind === "url" && !isUrl.test(trimmed)) return "url";
  if (setting.kind === "integer" && !isWholeNumber.test(trimmed)) return "integer";
  return undefined;
};

const methodOf = (authentication: ConnectionImplementation.Authentication): ConnectionMethod =>
  ConnectionImplementation.Authentication.isAnyOf(["ApiKey"])(authentication) ? "api-key" : "none";
const providerOf = (
  declaration: ConnectionImplementation.Declaration,
): ConnectionProviderOption => ({
  id: declaration.id,
  name: declaration.name,
  description: declaration.description,
  capability:
    declaration.capabilities.modelInference !== undefined
      ? "model-access"
      : declaration.capabilities.sandbox !== undefined
        ? "sandboxes"
        : undefined,
  methods: declaration.authentication.map(methodOf),
  settings: declaration.settings.map((setting) => ({
    key: setting.key,
    label: setting.label,
    kind: setting.kind,
    required: setting.required,
    ...(setting.description === undefined ? {} : { description: setting.description }),
    ...(setting.placeholder === undefined ? {} : { placeholder: setting.placeholder }),
  })),
});

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined;

/** A connection as the Connections sidebar lists it. */
export interface ConnectionListEntry {
  readonly id: string;
  readonly name: string;
  /** What it gives: model access for agents, or an account sandboxes run under. */
  readonly capability: ConnectionCapability | undefined;
  /**
   * `needs-setup` when it lacks required settings or its key, and `unavailable` when this server
   * no longer installs its provider.
   */
  readonly setup: ConnectionSetup;
  /** What setup still needs: required settings by key, and whether its key is missing. */
  readonly missing: { readonly settings: readonly string[]; readonly key: boolean };
}

/** A connection's setup from its readiness, as its list entry gives it. */
const listSetup = (view: Connection.View): Pick<ConnectionListEntry, "setup" | "missing"> => {
  const readiness = [view.readiness.modelInference, view.readiness.sandbox].find((entry) =>
    Predicate.isTagged(entry, "Incomplete"),
  );
  const missing = Predicate.isTagged(readiness, "Incomplete")
    ? { settings: readiness.settings, key: readiness.credential }
    : { settings: [], key: false };
  return {
    setup: !view.installed
      ? "unavailable"
      : Predicate.isTagged(readiness, "Incomplete")
        ? "needs-setup"
        : "configured",
    missing,
  };
};

/**
 * A workspace's connections by name, for navigation, live while mounted. It shares the
 * Connections page's read. `canCreate` says whether the reader may add one.
 */
export function useConnectionList(workspaceId: string) {
  const reads = connectionsReads(useApiClient(), workspaceId);
  const read = reads ? useAtomValue(() => reads.connections) : undefined;
  const canCreate = useWorkspacePermission(workspaceId, "connection.create");
  const connections = createMemo((): readonly ConnectionListEntry[] | undefined =>
    read === undefined
      ? undefined
      : Option.getOrUndefined(AsyncResult.value(read()))?.map((view) => ({
          id: view.id,
          name: view.name,
          capability:
            view.capabilities.modelInference !== undefined
              ? "model-access"
              : view.capabilities.sandbox !== undefined
                ? "sandboxes"
                : undefined,
          ...listSetup(view),
        })),
  );
  return {
    connections: () => connections() ?? [],
    /** Nothing has loaded yet, so an empty list says nothing. */
    loading: () => connections() === undefined,
    canCreate,
  };
}

/**
 * A workspace's connections, live while mounted: the providers this host installed, each
 * connection's setup, and the changes the reader may make. Creating takes two steps, the
 * connection and then its key, so no secret reaches the workspace's history. Drafts keep what
 * they were made against: a rename saved elsewhere meanwhile conflicts instead of being
 * overwritten. `done` hears each change once its result is shown.
 */
export function useConnections(
  workspaceId: string,
  options: { readonly done?: (done: ConnectionsDone) => void } = {},
) {
  const client = useApiClient();
  const reads = connectionsReads(client, workspaceId);
  const canCreate = useWorkspacePermission(workspaceId, "connection.create");
  const members = useMembers(workspaceId);
  const read = reads ? connect(reads) : undefined;

  const providers = createMemo(() => (read?.implementations() ?? []).map(providerOf));
  const providerOfEntry = (entry: ConnectionSummary) =>
    providers().find((provider) => provider.id === entry.providerId);
  const entryOf = (view: Connection.View): ConnectionSummary => {
    const provider = providers().find((candidate) => candidate.id === view.implementationId);
    const settings = provider
      ? provider.settings.map((setting) => ({
          ...setting,
          value: view.settings[setting.key] ?? "",
        }))
      : Object.entries(view.settings).map(([key, value]) => ({
          key,
          label: key,
          kind: "text" as const,
          required: false,
          value,
        }));
    // Every capability needs the same settings and key today, so any incomplete one says what.
    const readiness = [view.readiness.modelInference, view.readiness.sandbox].find((entry) =>
      Predicate.isTagged(entry, "Incomplete"),
    );
    const missing = Predicate.isTagged(readiness, "Incomplete")
      ? {
          settings: readiness.settings.map(
            (key) => provider?.settings.find((setting) => setting.key === key)?.label ?? key,
          ),
          key: readiness.credential,
        }
      : { settings: [], key: false };
    return {
      id: view.id,
      name: view.name,
      providerId: view.implementationId,
      provider,
      settings,
      endpoint:
        settings.find((setting) => setting.kind === "url" && setting.value !== "")?.value ||
        undefined,
      setup:
        !view.installed || !provider
          ? "unavailable"
          : Predicate.isTagged(readiness, "Incomplete")
            ? "needs-setup"
            : "configured",
      missing,
      method: Connection.View.fields.authentication.isAnyOf(["ApiKey"])(view.authentication)
        ? "api-key"
        : "none",
      keySaved:
        Connection.View.fields.authentication.isAnyOf(["ApiKey"])(view.authentication) &&
        view.authentication.configured,
      manageable: view.manageable,
      createdBy: memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt),
    };
  };
  const all = createMemo(() => (read?.connections() ?? []).map(entryOf));
  const loaded = () => read?.connections() !== undefined && read.implementations() !== undefined;

  const changes = useChanges({
    write: changeConnection(workspaceId),
    reload: reads ? reloadConnections(reads) : Effect.void,
    failed: (cause) => ({
      error: credentialsUnavailable(cause) ? "storage-unavailable" : workspaceFailure(cause),
      problems: [],
    }),
    done: (
      change: ConnectionCommand,
      created,
      details: { readonly subject?: string; readonly method?: ConnectionMethod } | undefined,
    ) => {
      if (change.kind === "create") {
        intent = undefined;
        setDraft(undefined);
      }
      if (change.kind === "rename") forget(setNames, change.connectionId);
      if (change.kind === "configure") forget(setConfigs, change.connectionId);
      if (change.kind === "set-key") setSecret("");
      options.done?.({
        action: change.kind,
        subject: details?.subject,
        created,
        method: details?.method,
      });
    },
    outdated: () => loaded() && read?.failure() !== undefined,
  });
  const send = changes.send;
  const find = (connectionId: string) => all().find((entry) => entry.id === connectionId);

  // A new connection: its provider, name, settings, and way of authenticating. Retrying the same
  // request reuses its key, so an attempt whose response was lost is not created twice.
  const [draft, setDraft] = createSignal<{
    readonly providerId: string;
    readonly name: string;
    readonly settings: Readonly<Record<string, string>>;
    readonly method: ConnectionMethod;
  }>();
  let intent:
    | { readonly body: string; readonly key: ReturnType<typeof newConnectionRequestKey> }
    | undefined;
  const draftProvider = () => {
    const current = draft();
    return current && providers().find((provider) => provider.id === current.providerId);
  };

  // Per connection: a rename keeps the name it was made against; settings keep their values.
  const [names, setNames] = createSignal<
    Readonly<Record<string, { readonly name: string; readonly expected: string }>>
  >({});
  const [configs, setConfigs] = createSignal<
    Readonly<Record<string, Readonly<Record<string, string>>>>
  >({});
  const forget = <A>(
    set: (update: (previous: Readonly<Record<string, A>>) => Readonly<Record<string, A>>) => void,
    connectionId: string,
  ) =>
    set((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => id !== connectionId)),
    );
  // The key being entered, kept only until it is saved or its dialog closes.
  const [secret, setSecret] = createSignal("");

  // After an explicit refresh, rename drafts stay and are made against the name now shown.
  createEffect(
    on(
      changes.revision,
      () =>
        setNames((previous) =>
          Object.fromEntries(
            Object.entries(previous).map(([id, edit]) => [
              id,
              { ...edit, expected: find(id)?.name ?? edit.expected },
            ]),
          ),
        ),
      { defer: true },
    ),
  );

  const valuesOf = (entry: ConnectionSummary) =>
    configs()[entry.id] ??
    Object.fromEntries(entry.settings.map((setting) => [setting.key, setting.value]));
  const cleaned = (settings: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(settings)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value !== ""),
    );
  const complete = (
    provider: ConnectionProviderOption,
    settings: Readonly<Record<string, string>>,
  ) =>
    provider.settings.every((setting) => {
      const value = settings[setting.key] ?? "";
      return (!setting.required || value.trim() !== "") && !settingIssue(setting, value);
    });

  return {
    /** Why nothing shows yet; undefined once the connections have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (loaded()) return undefined;
      const failure = read?.failure();
      if (!read) return "unavailable";
      if (failure === undefined) return "loading";
      return failure === "denied" || failure === "gone" ? "unavailable" : "failed";
    },
    /** The providers this host installed. */
    providers,
    /** The provider whose connections are accounts for a sandbox provider, by ID. */
    accountProvider: (sandboxProvider: string) =>
      read
        ?.implementations()
        ?.find((declaration) => declaration.capabilities.sandbox?.provider === sandboxProvider)?.id,
    /** Every connection the reader may read, by name. */
    connections: all,
    connection: find,
    /** The reader may add connections. */
    canCreate: () => canCreate() === true,
    /** The change running, or `refresh`. */
    pending: changes.pending,
    failure: (): ConnectionsFailure | undefined => {
      const failure = changes.failure();
      return failure && { action: failure.action, error: failure.error };
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: changes.stale,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry();
      else changes.refresh();
    },
    /** Set aside the last change's failure and the key being entered, as a dialog closes. */
    dismiss: () => {
      if (changes.pending()) return;
      changes.dismiss();
      setSecret("");
    },
    create: {
      /** Start a connection through a provider, named after it. */
      begin: (providerId: string) => {
        const provider = providers().find((candidate) => candidate.id === providerId);
        if (!provider) return;
        changes.dismiss();
        setDraft({
          providerId,
          name: provider.name,
          settings: Object.fromEntries(provider.settings.map((setting) => [setting.key, ""])),
          method: provider.methods[0] ?? "none",
        });
      },
      provider: draftProvider,
      name: () => draft()?.name ?? "",
      setName: (name: string) => setDraft((current) => current && { ...current, name }),
      value: (key: string) => draft()?.settings[key] ?? "",
      setValue: (key: string, value: string) =>
        setDraft(
          (current) => current && { ...current, settings: { ...current.settings, [key]: value } },
        ),
      /** Why a setting's value would be refused, once there is one. */
      issue: (key: string) => {
        const setting = draftProvider()?.settings.find((candidate) => candidate.key === key);
        return setting && settingIssue(setting, draft()?.settings[key] ?? "");
      },
      method: () => draft()?.method ?? "none",
      setMethod: (method: ConnectionMethod) =>
        setDraft((current) => current && { ...current, method }),
      /** The draft has a name and every required, well-formed setting. */
      ready: () => {
        const current = draft(),
          provider = draftProvider();
        return (
          current !== undefined &&
          provider !== undefined &&
          current.name.trim() !== "" &&
          complete(provider, current.settings)
        );
      },
      save: () => {
        const current = draft();
        if (!current) return;
        const body = {
          name: current.name.trim(),
          implementationId: current.providerId,
          settings: cleaned(current.settings),
          authentication: current.method === "api-key" ? ("ApiKey" as const) : ("None" as const),
        };
        const serialized = JSON.stringify(body);
        if (intent?.body !== serialized)
          intent = { body: serialized, key: newConnectionRequestKey() };
        send(
          { kind: "create", ...body, key: intent.key },
          { subject: body.name, method: current.method },
        );
      },
      cancel: () => {
        intent = undefined;
        setDraft(undefined);
      },
    },
    rename: {
      name: (connectionId: string) => names()[connectionId]?.name ?? find(connectionId)?.name ?? "",
      setName: (connectionId: string, name: string) =>
        setNames((previous) => ({
          ...previous,
          [connectionId]: {
            name,
            expected: previous[connectionId]?.expected ?? find(connectionId)?.name ?? "",
          },
        })),
      /** The name differs from the one saved and can be saved now. */
      changed: (connectionId: string) => {
        const name = names()[connectionId]?.name.trim();
        return (
          !changes.stale() && name !== undefined && name !== "" && name !== find(connectionId)?.name
        );
      },
      save: (connectionId: string) => {
        const edit = names()[connectionId];
        if (edit)
          send(
            {
              kind: "rename",
              connectionId,
              name: edit.name.trim(),
              expectedName: edit.expected,
            },
            { subject: edit.name.trim() },
          );
      },
    },
    configure: {
      value: (connectionId: string, key: string) => {
        const entry = find(connectionId);
        return entry ? (valuesOf(entry)[key] ?? "") : "";
      },
      setValue: (connectionId: string, key: string, value: string) => {
        const entry = find(connectionId);
        if (entry)
          setConfigs((previous) => ({
            ...previous,
            [connectionId]: { ...valuesOf(entry), [key]: value },
          }));
      },
      issue: (connectionId: string, key: string) => {
        const entry = find(connectionId);
        const setting = entry?.settings.find((candidate) => candidate.key === key);
        return entry && setting && settingIssue(setting, valuesOf(entry)[key] ?? "");
      },
      /** The settings differ from those saved, and can be saved now. */
      changed: (connectionId: string) => {
        const entry = find(connectionId),
          provider = entry && providerOfEntry(entry),
          edit = configs()[connectionId];
        if (!entry || !provider || !edit || changes.stale()) return false;
        const saved = cleaned(
          Object.fromEntries(entry.settings.map((setting) => [setting.key, setting.value])),
        );
        return JSON.stringify(cleaned(edit)) !== JSON.stringify(saved) && complete(provider, edit);
      },
      save: (connectionId: string) => {
        const entry = find(connectionId),
          edit = configs()[connectionId];
        if (entry && edit)
          send(
            { kind: "configure", connectionId, settings: cleaned(edit) },
            { subject: entry.name },
          );
      },
      /** Discard unsaved settings, such as when the details close. */
      reset: (connectionId: string) => {
        forget(setConfigs, connectionId);
        forget(setNames, connectionId);
      },
    },
    key: {
      secret,
      setSecret,
      /** Save the key entered for a connection, replacing any it had. */
      save: (connectionId: string) => {
        const value = secret().trim();
        if (value !== "")
          send(
            { kind: "set-key", connectionId, secret: value },
            { subject: find(connectionId)?.name },
          );
      },
      clear: (connectionId: string) =>
        send({ kind: "clear-key", connectionId }, { subject: find(connectionId)?.name }),
    },
    remove: (connectionId: string) =>
      send({ kind: "remove", connectionId }, { subject: find(connectionId)?.name }),
  };
}
export type ConnectionsView = ReturnType<typeof useConnections>;

function connect(reads: ConnectionsReads) {
  const connections = useAtomValue(() => reads.connections),
    implementations = useAtomValue(() => reads.implementations),
    retryConnections = useAtomRefresh(() => reads.connections),
    retryImplementations = useAtomRefresh(() => reads.implementations);
  return {
    connections: () => Option.getOrUndefined(AsyncResult.value(connections())),
    implementations: () => Option.getOrUndefined(AsyncResult.value(implementations())),
    /** Why the latest read failed, once it settles. */
    failure: () => {
      const cause = settled(connections()) ?? settled(implementations());
      return cause === undefined ? undefined : workspaceFailure(cause);
    },
    retry: () => {
      retryConnections();
      retryImplementations();
    },
  };
}
