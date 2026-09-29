import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Cause, Exit, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  environmentProblems,
  environmentsReads,
  environmentsRequest,
  newEnvironmentRequestKey,
  type Environment,
  type EnvironmentCommand,
  type EnvironmentProblem,
  type EnvironmentsReads,
} from "../api/environments.ts";
import { isStale, workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { toDate } from "../conversations/time.ts";
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts";
import { memberName } from "../conversations/views.ts";
import { useRequest } from "../request/use-request.ts";
import { SandboxDrafts, type Retention, type SandboxDraft } from "./draft.ts";

/** Where a harness's loop runs: in amends, or as a program inside the sandbox. */
export type Placement = "in-process" | "in-sandbox";
/**
 * What keeps an environment from running now: its harness or sandbox provider is no longer
 * installed, its account connection is gone, or that account still needs its key.
 */
export type EnvironmentIssue =
  | "harness-unavailable"
  | "sandbox-unavailable"
  | "connection-unavailable"
  | "connection-incomplete";

/** A harness this host installed. */
export interface HarnessChoice {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Where its loop can run. */
  readonly placements: readonly Placement[];
}
/** A sandbox provider this host installed. */
export interface SandboxProviderChoice {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Its sandboxes run under an account connection. */
  readonly account: boolean;
  /** How it describes the starting point it takes, if it takes one. */
  readonly template:
    | { readonly label: string; readonly description?: string; readonly placeholder?: string }
    | undefined;
}
/** A connection a sandbox can run under: an account at one provider. */
export interface SandboxAccount {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  /** Its key is saved, so the environment can be ready. */
  readonly ready: boolean;
}

/** An environment, as the list and its details show it. */
export interface EnvironmentEntry {
  readonly id: string;
  readonly name: string;
  readonly harnessId: string;
  /** Undefined when this host no longer installs the harness. */
  readonly harness: HarnessChoice | undefined;
  readonly sandbox:
    | {
        readonly providerId: string;
        /** Undefined when this host no longer installs the provider. */
        readonly provider: SandboxProviderChoice | undefined;
        readonly placement: Placement;
        /** Its account connection, if it runs under one; its name when the reader may read it. */
        readonly account: { readonly id: string; readonly name: string | undefined } | undefined;
        readonly template: string | undefined;
        readonly variables: ReadonlyArray<{ readonly key: string; readonly value: string }>;
        readonly commands: readonly string[];
        readonly retention: Retention;
      }
    | undefined;
  /** What keeps it from running now; empty when it is ready. */
  readonly issues: readonly EnvironmentIssue[];
  /** The reader may rename it, change its sandbox settings, and remove it. */
  readonly manageable: boolean;
  /** Who added it, by name; undefined for the one the workspace started with. */
  readonly createdBy: string | undefined;
  readonly createdAt: Date;
}

/** A change the reader can make to environments. */
export type EnvironmentAction = Exclude<EnvironmentCommand, { kind: "refresh" }>["kind"];
/**
 * Why a change or read failed: a workspace failure; `refresh-failed` when a change completed but
 * its result could not be read back; or `outdated` when a live refresh failed. `problems` names
 * what the host refused, such as a sandbox account that is no longer available.
 */
export type EnvironmentsError = WorkspaceFailure | "refresh-failed" | "outdated";
export interface EnvironmentsFailure {
  readonly action: EnvironmentAction | "refresh";
  readonly error: EnvironmentsError;
  readonly problems: readonly EnvironmentProblem[];
}
/** A change that completed and whose result is shown. */
export interface EnvironmentsDone {
  readonly action: EnvironmentAction;
  /** The environment it concerned, by name. */
  readonly subject?: string;
  /** The environment it created. */
  readonly created?: string;
}

/** The step of adding an environment: its basics, then its sandbox settings if it has one. */
export type CreateStep = "basics" | "sandbox";

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined;

/**
 * Edits to a sandbox draft, over whichever draft a form holds: an environment being added, or
 * one being configured.
 */
export interface SandboxEditor {
  readonly draft: () => SandboxDraft;
  readonly setAccount: (accountId: string | undefined) => void;
  readonly setTemplate: (template: string) => void;
  readonly addVariable: () => void;
  readonly setVariable: (
    id: string,
    change: { readonly key?: string; readonly value?: string },
  ) => void;
  readonly removeVariable: (id: string) => void;
  /** Why a variable row would be refused. */
  readonly variableIssue: (id: string) => "invalid" | "duplicate" | undefined;
  readonly addCommand: () => void;
  readonly setCommand: (id: string, command: string) => void;
  readonly moveCommand: (id: string, by: -1 | 1) => void;
  readonly removeCommand: (id: string) => void;
  readonly setRetention: (retention: Retention) => void;
}
const editor = (
  draft: () => SandboxDraft,
  change: (update: (draft: SandboxDraft) => SandboxDraft) => void,
): SandboxEditor => ({
  draft,
  setAccount: (accountId) => change((current) => SandboxDrafts.edit.account(current, accountId)),
  setTemplate: (template) => change((current) => SandboxDrafts.edit.template(current, template)),
  addVariable: () => change(SandboxDrafts.edit.addVariable),
  setVariable: (id, update) =>
    change((current) => SandboxDrafts.edit.variable(current, id, update)),
  removeVariable: (id) => change((current) => SandboxDrafts.edit.removeVariable(current, id)),
  variableIssue: (id) => SandboxDrafts.variableIssues(draft()).get(id),
  addCommand: () => change(SandboxDrafts.edit.addCommand),
  setCommand: (id, command) =>
    change((current) => SandboxDrafts.edit.command(current, id, command)),
  moveCommand: (id, by) => change((current) => SandboxDrafts.edit.moveCommand(current, id, by)),
  removeCommand: (id) => change((current) => SandboxDrafts.edit.removeCommand(current, id)),
  setRetention: (retention) =>
    change((current) => SandboxDrafts.edit.retention(current, retention)),
});

/** An environment as the Environments sidebar lists it. */
export interface EnvironmentListEntry {
  readonly id: string;
  readonly name: string;
  /** Something keeps it from running now. */
  readonly needsSetup: boolean;
}

/**
 * A workspace's environments by name, for navigation, live while mounted. It shares the
 * Environments page's read. `canCreate` says whether the reader may add one.
 */
export function useEnvironmentList(workspaceId: string) {
  const reads = environmentsReads(useApiClient(), workspaceId);
  const read = reads ? useAtomValue(() => reads.environments) : undefined;
  const canCreate = useWorkspacePermission(workspaceId, "environment.create");
  const environments = createMemo((): readonly EnvironmentListEntry[] | undefined =>
    read === undefined
      ? undefined
      : Option.getOrUndefined(AsyncResult.value(read()))?.map((view) => ({
          id: view.id,
          name: view.name,
          needsSetup: view.readiness._tag === "Incomplete",
        })),
  );
  return {
    environments: () => environments() ?? [],
    /** Nothing has loaded yet, so an empty list says nothing. */
    loading: () => environments() === undefined,
    canCreate,
  };
}

/**
 * A workspace's environments, live while mounted: the harnesses and sandbox providers this host
 * installed, the accounts sandboxes can run under, each environment's setup, and the changes the
 * reader may make. Drafts keep what they were made against, and survive a detour to create an
 * account: an environment's draft stays until it is saved or set aside. `done` hears each change
 * once its result is shown.
 */
export function useEnvironments(
  workspaceId: string,
  options: { readonly done?: (done: EnvironmentsDone) => void } = {},
) {
  const client = useApiClient();
  const reads = environmentsReads(client, workspaceId);
  const canCreate = useWorkspacePermission(workspaceId, "environment.create");
  const members = useMembers(workspaceId);
  const read = reads ? connect(reads) : undefined;

  const harnesses = createMemo((): readonly HarnessChoice[] =>
    (read?.implementations()?.harnesses ?? []).map((harness) => ({
      id: harness.id,
      name: harness.name,
      description: harness.description,
      placements: harness.placement,
    })),
  );
  const providers = createMemo((): readonly SandboxProviderChoice[] =>
    (read?.implementations()?.sandboxes ?? []).map((provider) => ({
      id: provider.id,
      name: provider.name,
      description: provider.description,
      account: provider.account,
      template:
        provider.template === undefined
          ? undefined
          : {
              label: provider.template.label,
              ...(provider.template.description === undefined
                ? {}
                : { description: provider.template.description }),
              ...(provider.template.placeholder === undefined
                ? {}
                : { placeholder: provider.template.placeholder }),
            },
    })),
  );
  const accounts = createMemo((): readonly SandboxAccount[] =>
    (read?.connections() ?? []).flatMap((connection) => {
      const provider = connection.capabilities.sandbox?.provider;
      return provider === undefined || !connection.installed
        ? []
        : [
            {
              id: connection.id,
              name: connection.name,
              providerId: provider,
              ready: connection.readiness.sandbox?._tag === "Ready",
            },
          ];
    }),
  );
  const providerOf = (id: string) => providers().find((provider) => provider.id === id);

  const entryOf = (view: Environment.View): EnvironmentEntry => {
    const sandbox = view.sandbox;
    const account =
      sandbox?.connectionId === null || sandbox === null
        ? undefined
        : {
            id: sandbox.connectionId,
            name: (read?.connections() ?? []).find(
              (connection) => connection.id === sandbox.connectionId,
            )?.name,
          };
    return {
      id: view.id,
      name: view.name,
      harnessId: view.harnessId,
      harness: harnesses().find((harness) => harness.id === view.harnessId),
      sandbox:
        sandbox === null
          ? undefined
          : {
              providerId: sandbox.providerId,
              provider: providerOf(sandbox.providerId),
              placement: sandbox.harness,
              account,
              template: sandbox.template ?? undefined,
              variables: Object.entries(sandbox.env).map(([key, value]) => ({ key, value })),
              commands: sandbox.setup,
              retention: sandbox.retention,
            },
      issues: view.readiness._tag === "Incomplete" ? view.readiness.issues : [],
      manageable: view.manageable,
      createdBy: view.createdBy === null ? undefined : memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt),
    };
  };
  const all = createMemo(() => (read?.environments() ?? []).map(entryOf));
  const loaded = () => read?.environments() !== undefined && read.implementations() !== undefined;
  const find = (environmentId: string) => all().find((entry) => entry.id === environmentId);

  // The change running or last run, with the environment it concerned, until it settles.
  const [attempt, setAttempt] = createSignal<{
    readonly action: EnvironmentAction | "refresh";
    readonly subject?: string;
  }>();
  const [error, setError] = createSignal<{
    readonly error: EnvironmentsError;
    readonly problems: readonly EnvironmentProblem[];
  }>();
  const [needsRefresh, setNeedsRefresh] = createSignal(false);
  const [revision, setRevision] = createSignal(0);
  let unconfirmed: { readonly command: EnvironmentCommand; readonly created?: string } | undefined;

  const finish = (command: EnvironmentCommand, created: string | undefined) => {
    const current = attempt();
    setAttempt(undefined);
    if (command.kind === "refresh") return;
    if (command.kind === "create") {
      intent = undefined;
      setDraft(undefined);
    }
    if (command.kind === "rename") forget(setNames, command.environmentId);
    if (command.kind === "configure") forget(setConfigs, command.environmentId);
    options.done?.({ action: command.kind, subject: current?.subject, created });
  };
  const request = useRequest(environmentsRequest(client, workspaceId), (exit, command) => {
    if (Exit.isFailure(exit)) {
      const failure = workspaceFailure(exit.cause);
      setError({ error: failure, problems: environmentProblems(exit.cause) });
      if (isStale(failure)) setNeedsRefresh(true);
      return;
    }
    const { refreshed, created } = exit.value;
    if (Exit.isFailure(refreshed)) {
      if (command.kind !== "refresh") {
        unconfirmed = { command, created };
        setError({ error: "refresh-failed", problems: [] });
        setNeedsRefresh(true);
      } else setError({ error: workspaceFailure(refreshed.cause), problems: [] });
      return;
    }
    setNeedsRefresh(false);
    if (command.kind === "refresh") setRevision((value) => value + 1);
    const done = command.kind === "refresh" ? unconfirmed : { command, created };
    unconfirmed = undefined;
    if (done) finish(done.command, done.created);
    else setAttempt(undefined);
  });
  const [running, setRunning] = createSignal<EnvironmentAction | "refresh">();
  const send = (command: EnvironmentCommand, subject?: string) => {
    if (request.pending() || (needsRefresh() && command.kind !== "refresh")) return;
    setError(undefined);
    if (command.kind !== "refresh" || !needsRefresh() || !attempt())
      setAttempt({ action: command.kind, subject });
    setRunning(command.kind);
    request.run(command);
  };

  // A new environment: its basics, then its sandbox settings. Retrying the same request reuses
  // its key, so an attempt whose response was lost is not created twice.
  const [draft, setDraft] = createSignal<{
    readonly name: string;
    readonly harnessId: string | undefined;
    readonly providerId: string | undefined;
    readonly placement: Placement | undefined;
    readonly step: CreateStep;
    readonly sandbox: SandboxDraft;
  }>();
  let intent:
    | { readonly body: string; readonly key: ReturnType<typeof newEnvironmentRequestKey> }
    | undefined;
  const draftHarness = () => harnesses().find((harness) => harness.id === draft()?.harnessId);
  const draftProvider = () => {
    const id = draft()?.providerId;
    return id === undefined ? undefined : providerOf(id);
  };
  /** Where the harness can run with the chosen sandbox: only in process without one. */
  const placementsFor = (harness: HarnessChoice | undefined, providerId: string | undefined) =>
    (harness?.placements ?? []).filter(
      (placement) => providerId !== undefined || placement === "in-process",
    );
  const draftPlacement = (): Placement | undefined => {
    const current = draft();
    const available = placementsFor(draftHarness(), current?.providerId);
    return current?.placement !== undefined && available.includes(current.placement)
      ? current.placement
      : available[0];
  };
  const patch = (change: Partial<NonNullable<ReturnType<typeof draft>>>) =>
    setDraft((current) => current && Object.assign({}, current, change));

  // Per environment: a rename keeps the name it was made against; sandbox drafts keep their edits.
  const [names, setNames] = createSignal<
    Readonly<Record<string, { readonly name: string; readonly expected: string }>>
  >({});
  const [configs, setConfigs] = createSignal<Readonly<Record<string, SandboxDraft>>>({});
  const forget = <A>(
    set: (update: (previous: Readonly<Record<string, A>>) => Readonly<Record<string, A>>) => void,
    environmentId: string,
  ) =>
    set((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => id !== environmentId)),
    );
  const savedDraft = (entry: EnvironmentEntry): SandboxDraft | undefined => {
    const view = read?.environments()?.find((environment) => environment.id === entry.id);
    return view?.sandbox ? SandboxDrafts.fromSandbox(view.sandbox) : undefined;
  };
  const configDraft = (environmentId: string) => {
    const saved = configs()[environmentId];
    if (saved) return saved;
    const entry = find(environmentId);
    return (entry && savedDraft(entry)) ?? SandboxDrafts.empty();
  };
  const shape = (provider: SandboxProviderChoice | undefined) => ({
    account: provider?.account ?? false,
    template: provider?.template !== undefined,
  });

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

  return {
    /** Why nothing shows yet; undefined once the environments have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (loaded()) return undefined;
      if (!read) return "unavailable";
      const failure = read.failure();
      if (failure === undefined) return "loading";
      return failure === "denied" || failure === "gone" ? "unavailable" : "failed";
    },
    harnesses,
    providers,
    /** Accounts for a provider, ready ones first. */
    accounts: (providerId: string) =>
      accounts()
        .filter((account) => account.providerId === providerId)
        .toSorted((left, right) => Number(right.ready) - Number(left.ready)),
    /** Every environment the reader may read, by name. */
    environments: all,
    environment: find,
    /** The reader may add environments. */
    canCreate: () => canCreate() === true,
    /** The change running, or `refresh`. */
    pending: () => (request.pending() ? running() : undefined),
    failure: (): EnvironmentsFailure | undefined => {
      const current = error();
      const readFailure = loaded() ? read?.failure() : undefined;
      if (current === undefined)
        return readFailure === undefined
          ? undefined
          : { action: "refresh", error: "outdated", problems: [] };
      const action = attempt()?.action;
      if (action) return { action, ...current };
      return needsRefresh() ? { action: "refresh", ...current } : undefined;
    },
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: needsRefresh,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry();
      else send({ kind: "refresh" });
    },
    /** Set aside the last change's failure, as a dialog closes. */
    dismiss: () => {
      if (!request.pending()) setAttempt(undefined);
    },
    create: {
      /** Start an environment: no sandbox, and the first installed harness. */
      begin: () => {
        setAttempt(undefined);
        setError(undefined);
        intent = undefined;
        setDraft({
          name: "",
          harnessId: harnesses()[0]?.id,
          providerId: undefined,
          placement: undefined,
          step: "basics",
          sandbox: SandboxDrafts.empty(),
        });
      },
      /** An environment is being added, including while a detour creates an account for it. */
      active: () => draft() !== undefined,
      step: () => draft()?.step ?? "basics",
      name: () => draft()?.name ?? "",
      setName: (name: string) => patch({ name }),
      harnessId: () => draft()?.harnessId,
      setHarness: (harnessId: string) => patch({ harnessId }),
      /** The chosen sandbox provider; undefined for no sandbox. */
      providerId: () => draft()?.providerId,
      provider: draftProvider,
      setProvider: (providerId: string | undefined) => patch({ providerId }),
      /** Where the harness can run with the chosen sandbox; a choice only when there are two. */
      placements: () => placementsFor(draftHarness(), draft()?.providerId),
      placement: draftPlacement,
      setPlacement: (placement: Placement) => patch({ placement }),
      /** The basics are complete: a name, and a harness that can run as chosen. */
      basicsReady: () =>
        (draft()?.name.trim() ?? "") !== "" &&
        draftHarness() !== undefined &&
        draftPlacement() !== undefined,
      /** Go on to the sandbox settings, when there is a sandbox. */
      next: () => {
        if (draft()?.providerId !== undefined) patch({ step: "sandbox" });
      },
      back: () => patch({ step: "basics" }),
      sandbox: editor(
        () => draft()?.sandbox ?? SandboxDrafts.empty(),
        (update) =>
          setDraft(
            (current) =>
              current && Object.assign({}, current, { sandbox: update(current.sandbox) }),
          ),
      ),
      /** Everything is complete, so the environment can be created. */
      ready: () => {
        const current = draft();
        if (!current || current.name.trim() === "" || !draftHarness() || !draftPlacement())
          return false;
        const provider = draftProvider();
        return (
          current.providerId === undefined ||
          (provider !== undefined && SandboxDrafts.valid(current.sandbox, provider))
        );
      },
      save: () => {
        const current = draft();
        const harness = draftHarness();
        const placement = draftPlacement();
        if (!current || !harness || !placement) return;
        const provider = draftProvider();
        const input = {
          name: current.name.trim(),
          harnessId: harness.id,
          sandbox:
            current.providerId === undefined
              ? null
              : Object.assign(
                  { providerId: current.providerId, harness: placement },
                  SandboxDrafts.settings(current.sandbox, shape(provider)),
                ),
        } as Environment.CreateInput;
        const serialized = JSON.stringify(input);
        if (intent?.body !== serialized)
          intent = { body: serialized, key: newEnvironmentRequestKey() };
        send({ kind: "create", input, key: intent.key }, input.name);
      },
      cancel: () => {
        intent = undefined;
        setDraft(undefined);
      },
    },
    rename: {
      name: (environmentId: string) =>
        names()[environmentId]?.name ?? find(environmentId)?.name ?? "",
      setName: (environmentId: string, name: string) =>
        setNames((previous) => ({
          ...previous,
          [environmentId]: {
            name,
            expected: previous[environmentId]?.expected ?? find(environmentId)?.name ?? "",
          },
        })),
      /** The name differs from the one saved and can be saved now. */
      changed: (environmentId: string) => {
        const name = names()[environmentId]?.name.trim();
        return (
          !needsRefresh() && name !== undefined && name !== "" && name !== find(environmentId)?.name
        );
      },
      save: (environmentId: string) => {
        const edit = names()[environmentId];
        if (edit)
          send(
            {
              kind: "rename",
              environmentId,
              name: edit.name.trim(),
              expectedName: edit.expected,
            },
            edit.name.trim(),
          );
      },
    },
    configure: {
      /** Edits to an environment's sandbox settings, kept until saved or reset. */
      sandbox: (environmentId: string) =>
        editor(
          () => configDraft(environmentId),
          (update) =>
            setConfigs((previous) => ({
              ...previous,
              [environmentId]: update(configDraft(environmentId)),
            })),
        ),
      /** The settings differ from those saved, and can be saved now. */
      changed: (environmentId: string) => {
        const entry = find(environmentId);
        const edit = configs()[environmentId];
        if (!entry?.sandbox?.provider || !edit || needsRefresh()) return false;
        const saved = savedDraft(entry);
        const provider = shape(entry.sandbox.provider);
        return (
          saved !== undefined &&
          !SandboxDrafts.same(edit, saved, provider) &&
          SandboxDrafts.valid(edit, entry.sandbox.provider)
        );
      },
      save: (environmentId: string) => {
        const entry = find(environmentId);
        const edit = configs()[environmentId];
        if (entry?.sandbox && edit)
          send(
            {
              kind: "configure",
              environmentId,
              sandbox: SandboxDrafts.settings(edit, shape(entry.sandbox.provider)),
            },
            entry.name,
          );
      },
      /** Discard unsaved edits, such as when the details close. */
      reset: (environmentId: string) => {
        forget(setConfigs, environmentId);
        forget(setNames, environmentId);
      },
    },
    remove: (environmentId: string) =>
      send({ kind: "remove", environmentId }, find(environmentId)?.name),
  };
}
export type EnvironmentsView = ReturnType<typeof useEnvironments>;

function connect(reads: EnvironmentsReads) {
  const environments = useAtomValue(() => reads.environments),
    implementations = useAtomValue(() => reads.implementations),
    connections = useAtomValue(() => reads.connections),
    retryEnvironments = useAtomRefresh(() => reads.environments),
    retryImplementations = useAtomRefresh(() => reads.implementations);
  return {
    environments: () => Option.getOrUndefined(AsyncResult.value(environments())),
    implementations: () => Option.getOrUndefined(AsyncResult.value(implementations())),
    /** The connections the reader may read; none while they load or when they cannot. */
    connections: () => Option.getOrUndefined(AsyncResult.value(connections())),
    /** Why the latest read failed, once it settles. */
    failure: () => {
      const cause = settled(environments()) ?? settled(implementations());
      return cause === undefined ? undefined : workspaceFailure(cause);
    },
    retry: () => {
      retryEnvironments();
      retryImplementations();
    },
  };
}
