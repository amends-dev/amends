import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Cause, Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  connectionsReads,
  connectionsRequest,
  credentialsUnavailable,
  newConnectionRequestKey,
  type Connection,
  type ConnectionCommand,
  type ConnectionImplementation,
  type ConnectionsReads,
} from "../api/connections.ts";
import { isStale, workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { toDate } from "../conversations/time.ts";
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts";
import { memberName } from "../conversations/views.ts";
import { useRequest } from "../request/use-request.ts";

/**
 * Whether a connection can be used: `configured` when it has what its provider needs,
 * `needs-setup` when it lacks required settings or its key, and `unavailable` when this host no
 * longer installs its provider. Configured never means a request to the provider succeeded.
 */
export type ConnectionSetup = "configured" | "needs-setup" | "unavailable";
/** How a connection authenticates, chosen when it is created. */
export type ConnectionMethod = "api-key" | "none";

/** What a provider's connections give access to: model providers, or sandboxes for environments. */
export type ConnectionCapability = "model-access" | "sandboxes";

/** A setting a provider takes, as its implementation declares it. */
export interface ConnectionSetting {
  readonly key: string;
  readonly label: string;
  readonly kind: "text" | "url" | "integer";
  readonly required: boolean;
  readonly description?: string;
  readonly placeholder?: string;
}

/** A provider this host installed, which a new connection goes through. */
export interface ConnectionProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** What its connections give access to. */
  readonly capability: ConnectionCapability | undefined;
  /** The sandbox provider whose account its connections are, if they are one. */
  readonly sandboxProvider: string | undefined;
  /** The ways its connections may authenticate, in the order it prefers them. */
  readonly methods: readonly ConnectionMethod[];
  readonly settings: readonly ConnectionSetting[];
}

/** A connection, as the list and its details show it. Its key never reaches the client. */
export interface ConnectionEntry {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  /** Undefined when this host no longer installs the provider. */
  readonly provider: ConnectionProvider | undefined;
  /** Its settings with their values; the saved keys alone when the provider is unavailable. */
  readonly settings: ReadonlyArray<ConnectionSetting & { readonly value: string }>;
  /** Its first URL setting's value; undefined when it uses the provider's default. */
  readonly endpoint: string | undefined;
  readonly setup: ConnectionSetup;
  /** What setup still needs: required settings by label, and whether its key is missing. */
  readonly missing: { readonly settings: readonly string[]; readonly key: boolean };
  readonly method: ConnectionMethod;
  readonly keySaved: boolean;
  /** The reader may rename it, change its settings and key, and remove it. */
  readonly manageable: boolean;
  readonly createdBy: string;
  readonly createdAt: Date;
}

/** A change the reader can make to connections. */
export type ConnectionAction = Exclude<ConnectionCommand, { kind: "refresh" }>["kind"];
/**
 * Why a change or read failed: a workspace failure; `storage-unavailable` when the host keeps no
 * credentials; `refresh-failed` when a change completed but its result could not be read back;
 * or `outdated` when a live refresh failed.
 */
export type ConnectionsError =
  | WorkspaceFailure
  | "storage-unavailable"
  | "refresh-failed"
  | "outdated";
export interface ConnectionsFailure {
  readonly action: ConnectionAction | "refresh";
  readonly error: ConnectionsError;
}
/** A change that completed and whose result is shown. */
export interface ConnectionsDone {
  readonly action: ConnectionAction;
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
const settingIssue = (setting: ConnectionSetting, value: string): "url" | "integer" | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (setting.kind === "url" && !isUrl.test(trimmed)) return "url";
  if (setting.kind === "integer" && !isWholeNumber.test(trimmed)) return "integer";
  return undefined;
};

const methodOf = (authentication: ConnectionImplementation.Authentication): ConnectionMethod =>
  authentication._tag === "ApiKey" ? "api-key" : "none";
const providerOf = (declaration: ConnectionImplementation.Declaration): ConnectionProvider => ({
  id: declaration.id,
  name: declaration.name,
  description: declaration.description,
  capability:
    declaration.capabilities.modelInference !== undefined
      ? "model-access"
      : declaration.capabilities.sandbox !== undefined
        ? "sandboxes"
        : undefined,
  sandboxProvider: declaration.capabilities.sandbox?.provider,
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
  readonly setup: "configured" | "needs-setup" | "unavailable";
  /** What setup still needs: required settings by key, and whether its key is missing. */
  readonly missing: { readonly settings: readonly string[]; readonly key: boolean };
}

/** A connection's setup from its readiness, as its list entry gives it. */
const listSetup = (view: Connection.View): Pick<ConnectionListEntry, "setup" | "missing"> => {
  const readiness = [view.readiness.modelInference, view.readiness.sandbox].find(
    (entry) => entry?._tag === "Incomplete",
  );
  const missing =
    readiness?._tag === "Incomplete"
      ? { settings: readiness.settings, key: readiness.credential }
      : { settings: [], key: false };
  return {
    setup: !view.installed
      ? "unavailable"
      : readiness?._tag === "Incomplete"
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
  const entryOf = (view: Connection.View): ConnectionEntry => {
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
    const readiness = [view.readiness.modelInference, view.readiness.sandbox].find(
      (entry) => entry?._tag === "Incomplete",
    );
    const missing =
      readiness?._tag === "Incomplete"
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
          : readiness?._tag === "Incomplete"
            ? "needs-setup"
            : "configured",
      missing,
      method: view.authentication._tag === "ApiKey" ? "api-key" : "none",
      keySaved: view.authentication._tag === "ApiKey" && view.authentication.configured,
      manageable: view.manageable,
      createdBy: memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt),
    };
  };
  const all = createMemo(() => (read?.connections() ?? []).map(entryOf));
  const loaded = () => read?.connections() !== undefined && read.implementations() !== undefined;

  // The change running or last run, with the connection it concerned, until it settles.
  const [attempt, setAttempt] = createSignal<{
    readonly action: ConnectionAction | "refresh";
    readonly subject?: string;
    readonly method?: ConnectionMethod;
  }>();
  const [error, setError] = createSignal<ConnectionsError>();
  const [needsRefresh, setNeedsRefresh] = createSignal(false);
  const [revision, setRevision] = createSignal(0);
  let unconfirmed: { readonly command: ConnectionCommand; readonly created?: string } | undefined;

  const finish = (command: ConnectionCommand, created: string | undefined) => {
    const current = attempt();
    setAttempt(undefined);
    if (command.kind === "refresh") return;
    if (command.kind === "create") {
      intent = undefined;
      setDraft(undefined);
    }
    if (command.kind === "rename") forget(setNames, command.connectionId);
    if (command.kind === "configure") forget(setConfigs, command.connectionId);
    if (command.kind === "set-key") setSecret("");
    options.done?.({
      action: command.kind,
      subject: current?.subject,
      created,
      method: current?.method,
    });
  };
  const request = useRequest(connectionsRequest(client, workspaceId), (exit, command) => {
    if (Exit.isFailure(exit)) {
      const failure = workspaceFailure(exit.cause);
      setError(credentialsUnavailable(exit.cause) ? "storage-unavailable" : failure);
      if (isStale(failure)) setNeedsRefresh(true);
      return;
    }
    const { refreshed, created } = exit.value;
    if (Exit.isFailure(refreshed)) {
      if (command.kind !== "refresh") {
        unconfirmed = { command, created };
        setError("refresh-failed");
        setNeedsRefresh(true);
      } else setError(workspaceFailure(refreshed.cause));
      return;
    }
    setNeedsRefresh(false);
    if (command.kind === "refresh") setRevision((value) => value + 1);
    const done = command.kind === "refresh" ? unconfirmed : { command, created };
    unconfirmed = undefined;
    if (done) finish(done.command, done.created);
    else setAttempt(undefined);
  });
  const [running, setRunning] = createSignal<ConnectionAction | "refresh">();
  const send = (
    command: ConnectionCommand,
    details: { readonly subject?: string; readonly method?: ConnectionMethod } = {},
  ) => {
    if (request.pending() || (needsRefresh() && command.kind !== "refresh")) return;
    setError(undefined);
    if (command.kind !== "refresh" || !needsRefresh() || !attempt())
      setAttempt({ action: command.kind, ...details });
    setRunning(command.kind);
    request.run(command);
  };
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
      revision,
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

  const valuesOf = (entry: ConnectionEntry) =>
    configs()[entry.id] ??
    Object.fromEntries(entry.settings.map((setting) => [setting.key, setting.value]));
  const cleaned = (settings: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(settings)
        .map(([key, value]) => [key, value.trim()] as const)
        .filter(([, value]) => value !== ""),
    );
  const complete = (provider: ConnectionProvider, settings: Readonly<Record<string, string>>) =>
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
    /** Every connection the reader may read, by name. */
    connections: all,
    connection: find,
    /** The reader may add connections. */
    canCreate: () => canCreate() === true,
    /** The change running, or `refresh`. */
    pending: () => (request.pending() ? running() : undefined),
    failure: (): ConnectionsFailure | undefined => {
      const current = error();
      const readFailure = loaded() ? read?.failure() : undefined;
      if (current === undefined)
        return readFailure === undefined ? undefined : { action: "refresh", error: "outdated" };
      const action = attempt()?.action;
      if (action) return { action, error: current };
      return needsRefresh() ? { action: "refresh", error: current } : undefined;
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: needsRefresh,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry();
      else send({ kind: "refresh" });
    },
    /** Set aside the last change's failure and the key being entered, as a dialog closes. */
    dismiss: () => {
      if (request.pending()) return;
      setAttempt(undefined);
      setSecret("");
    },
    create: {
      /** Start a connection through a provider, named after it. */
      begin: (providerId: string) => {
        const provider = providers().find((candidate) => candidate.id === providerId);
        if (!provider) return;
        setAttempt(undefined);
        setError(undefined);
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
          !needsRefresh() && name !== undefined && name !== "" && name !== find(connectionId)?.name
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
          edit = configs()[connectionId];
        if (!entry?.provider || !edit || needsRefresh()) return false;
        const saved = cleaned(
          Object.fromEntries(entry.settings.map((setting) => [setting.key, setting.value])),
        );
        return (
          JSON.stringify(cleaned(edit)) !== JSON.stringify(saved) && complete(entry.provider, edit)
        );
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
