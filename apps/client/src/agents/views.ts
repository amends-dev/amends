import type {
  AgentBlocker,
  AgentEnvironmentOption,
  AgentIssue,
  AgentRoleOption,
  AgentsAction,
  AgentsFailure,
  AgentSummary,
  AgentTurnSummary,
  ModelConnectionOption,
} from "@amends/ui/screens/agents";
import { useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Cause, Effect, Option, Predicate } from "effect";
import { Atom, AsyncResult } from "effect/reactivity";
import {
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  on,
  onCleanup,
  runWithOwner,
} from "solid-js";
import {
  agentProblems,
  issueCode,
  agentsReads,
  changeAgent,
  newAgentRequestKey,
  reloadAgents,
  Agent,
  type AgentCommand,
  type AgentConfiguration,
  type AgentsReads,
  EnvironmentCompatibility,
} from "./api.ts";
import { useApiClient } from "../provider.tsx";
import { useChanges } from "../api/changes.ts";
import { workspaceFailure } from "../api/failures.ts";
import { toDate } from "../conversations/time.ts";
import { useMembers, useWorkspacePermission } from "../conversations/reads.ts";
import { memberName } from "../conversations/views.ts";
import { useTurnActivity } from "../turns/views.ts";

/** A change that completed and whose result is shown. */
export interface AgentsDone {
  readonly action: AgentsAction;
  /** The agent it concerned, by name. */
  readonly subject?: string;
  /** The agent it created. */
  readonly created?: string;
}

/** An agent's configuration being edited: for one being added, or one being configured. */
export interface AgentDraft {
  readonly instructions: string;
  readonly connectionId: string | undefined;
  readonly model: string;
  /** Undefined for the harness's default. */
  readonly reasoning: string | undefined;
  readonly environmentId: string | undefined;
}

/** Edits to a draft's configuration, and what its choices look like now. */
export interface ConfigurationEditor {
  readonly draft: () => AgentDraft;
  readonly setInstructions: (instructions: string) => void;
  /** Choosing a connection suggests its first model when none was entered. */
  readonly setConnection: (connectionId: string) => void;
  readonly setModel: (model: string) => void;
  readonly setReasoning: (reasoning: string | undefined) => void;
  readonly setEnvironment: (environmentId: string) => void;
  /** The environments the reader may use, with how each fits the chosen model access. */
  readonly environments: () => readonly AgentEnvironmentOption[];
  /** The chosen environment, once the reader may use it. */
  readonly environment: () => AgentEnvironmentOption | undefined;
  /** The draft names everything it needs, and nothing that cannot run. */
  readonly complete: () => boolean;
}

/** The built-in Member role, the one a new agent starts with unless the reader chooses another. */
const memberRole = "builtin:member";

const settled = <A, E>(read: AsyncResult.AsyncResult<A, E>): Cause.Cause<E> | undefined =>
  AsyncResult.isFailure(read) && !read.waiting ? read.cause : undefined;

const blocker = (issue: AgentIssue): issue is AgentBlocker =>
  issue === "no-model-inference" ||
  issue === "interface-unsupported" ||
  issue === "reasoning-unsupported";

/** The same configuration, whatever surrounding whitespace was typed. */
const sameConfiguration = (left: AgentConfiguration, right: AgentConfiguration) =>
  left.instructions === right.instructions &&
  left.model.connectionId === right.model.connectionId &&
  left.model.model === right.model.model &&
  left.model.reasoning === right.model.reasoning &&
  left.environmentId === right.environmentId;

/** An agent as the Agents sidebar lists it, with the member it acts as. */
export interface AgentListEntry extends Pick<AgentSummary, "id" | "name" | "issues" | "activity"> {
  readonly memberId: string;
}

/**
 * A workspace's agents by name, for navigation, live while mounted. It shares the Agents page's
 * read, so both show the same agents. `canCreate` says whether the reader may add one.
 */
export function useAgentList(workspaceId: string) {
  const reads = agentsReads(useApiClient(), workspaceId);
  const read = reads ? useAtomValue(() => reads.agents) : undefined;
  const canCreate = useWorkspacePermission(workspaceId, "agent.create");
  const activity = useTurnActivity(workspaceId);
  const agents = createMemo((): readonly AgentListEntry[] | undefined =>
    read === undefined
      ? undefined
      : Option.getOrUndefined(AsyncResult.value(read()))?.map((view) => ({
          id: view.id,
          memberId: view.memberId,
          name: view.name,
          issues: Agent.Readiness.isAnyOf(["Incomplete"])(view.readiness)
            ? view.readiness.issues.map(issueCode)
            : [],
          activity: activity.agentActivity(view.memberId),
        })),
  );
  return {
    agents: () => agents() ?? [],
    /** Nothing has loaded yet, so an empty list says nothing. */
    loading: () => agents() === undefined,
    canCreate,
  };
}

/**
 * Each agent's state by its member ID, live while mounted: its setup from the agents read it
 * shares with the Agents pages, and where it is at work from the active turns. Undefined for a
 * member who is not an agent, or before the agents load.
 */
export function useAgentStates(workspaceId: string) {
  const list = useAgentList(workspaceId);
  const byMember = createMemo(
    () => new Map(list.agents().map((agent) => [agent.memberId, agent] as const)),
  );
  return (memberId: string): Pick<AgentSummary, "issues" | "activity"> | undefined =>
    byMember().get(memberId);
}

/**
 * A workspace's agents, live while mounted: each agent's configuration and readiness, the model
 * connections and environments it can use, and the changes the reader may make. Drafts keep what
 * they were made against, and survive a detour to create a model connection: an agent's draft
 * stays until it is saved or set aside. `selected` names the agent open for configuring, whose
 * environment choices are checked. `done` hears each change once its result is shown.
 */
export function useAgents(
  workspaceId: string,
  options: {
    readonly selected?: () => string | undefined;
    readonly done?: (done: AgentsDone) => void;
  } = {},
) {
  const client = useApiClient();
  const reads = agentsReads(client, workspaceId);
  const canCreate = useWorkspacePermission(workspaceId, "agent.create");
  const members = useMembers(workspaceId);
  const activity = useTurnActivity(workspaceId);
  const read = reads ? connect(reads) : undefined;

  const connections = createMemo((): readonly ModelConnectionOption[] => {
    const implementations = read?.connectionImplementations() ?? [];
    return (read?.connections() ?? []).flatMap((connection) => {
      const inference = connection.installed ? connection.capabilities.modelInference : undefined;
      if (inference === undefined) return [];
      const models =
        implementations.find((implementation) => implementation.id === connection.implementationId)
          ?.capabilities.modelInference?.models ?? [];
      return [
        {
          id: connection.id,
          name: connection.name,
          ready: Predicate.isTagged(connection.readiness.modelInference, "Ready"),
          models,
        },
      ];
    });
  });
  const connectionOf = (id: string | undefined) =>
    id === undefined ? undefined : connections().find((connection) => connection.id === id);

  /** Each environment the reader may read, with its runtime and its harness's reasoning levels. */
  const environments = createMemo(() => {
    const implementations = read?.environmentImplementations();
    return new Map(
      (read?.environments() ?? []).map((environment) => {
        const harness = implementations?.harnesses.find(
          (candidate) => candidate.id === environment.harnessId,
        );
        const provider =
          environment.sandbox === null
            ? undefined
            : (implementations?.sandboxes.find(
                (candidate) => candidate.id === environment.sandbox?.providerId,
              )?.name ?? environment.sandbox.providerId);
        return [
          environment.id as string,
          {
            id: environment.id as string,
            name: environment.name,
            runtime: `${harness?.name ?? environment.harnessId} · ${provider ?? "No sandbox"}`,
            harness: harness?.name ?? environment.harnessId,
            provider,
            reasoningLevels: harness?.reasoning ?? [],
          },
        ] as const;
      }),
    );
  });

  const entryOf = (view: Agent.View): AgentSummary => {
    const environment = environments().get(view.environmentId);
    return {
      id: view.id,
      name: view.name,
      role: view.role?.name,
      instructions: view.instructions,
      connection: {
        id: view.model.connectionId,
        name: (read?.connections() ?? []).find(
          (connection) => connection.id === view.model.connectionId,
        )?.name,
      },
      model: view.model.model,
      reasoning: view.model.reasoning ?? undefined,
      environment: {
        id: view.environmentId,
        name: environment?.name,
        runtime: environment?.runtime,
      },
      issues: Agent.Readiness.isAnyOf(["Incomplete"])(view.readiness)
        ? view.readiness.issues.map(issueCode)
        : [],
      configurable: view.configurable,
      removable: view.removable,
      createdBy: memberName(members.member(view.createdBy)),
      createdAt: toDate(view.createdAt),
      activity: activity.agentActivity(view.memberId),
    };
  };
  const all = createMemo(() => (read?.agents() ?? []).map(entryOf));
  const loaded = () => read?.agents() !== undefined;
  const find = (agentId: string) => all().find((entry) => entry.id === agentId);

  const roles = createMemo((): readonly AgentRoleOption[] =>
    (read?.settings()?.roles ?? []).flatMap((choice) =>
      choice.assignable ? [{ id: choice.role.id, name: choice.role.name }] : [],
    ),
  );

  const changes = useChanges({
    write: changeAgent(workspaceId),
    reload: reads ? reloadAgents(reads) : Effect.void,
    failed: (cause) => {
      const problems = agentProblems(cause);
      // A connection or environment that left the reader's reach: reload what can be chosen.
      if (
        problems.some(
          (problem) =>
            problem.kind === "connection-unavailable" || problem.kind === "environment-unavailable",
        )
      )
        read?.reloadChoices();
      // An initial role the reader may not give is refused at its field; the rest stays current.
      const error = problems.some((problem) => problem.kind === "role-denied")
        ? "invalid"
        : workspaceFailure(cause);
      return { error, problems };
    },
    done: (change: AgentCommand, created, subject: string | undefined) => {
      if (change.kind === "create") {
        intent = undefined;
        setCreating(undefined);
      }
      if (change.kind === "rename") forget(setNames, change.agentId);
      if (change.kind === "configure") forget(setConfigs, change.agentId);
      options.done?.({ action: change.kind, subject, created });
    },
    outdated: () => loaded() && read?.failure() !== undefined,
  });
  const send = changes.send;

  /**
   * The environment choices for a draft's model access. The model is checked once typing pauses,
   * so each keystroke does not ask again.
   */
  const choicesFor = (draft: () => AgentDraft | undefined) => {
    const [model, setModel] = createSignal<string>();
    createEffect(
      on(
        () => draft()?.model.trim(),
        (typed) => {
          if (model() === undefined) return setModel(typed);
          const timer = setTimeout(() => setModel(typed), 300);
          onCleanup(() => clearTimeout(timer));
        },
      ),
    );
    const selection = createMemo(
      () => {
        const current = draft();
        const connection = connectionOf(current?.connectionId);
        const typed = model();
        return current && connection && typed
          ? { connectionId: connection.id, model: typed, reasoning: current.reasoning }
          : undefined;
      },
      undefined,
      {
        equals: (left, right) =>
          left?.connectionId === right?.connectionId &&
          left?.model === right?.model &&
          left?.reasoning === right?.reasoning,
      },
    );
    return reads ? choices(reads, selection) : () => undefined;
  };

  /** Edits over whichever draft a form holds, with the environments it can choose from. */
  const editor = (
    draft: () => AgentDraft,
    change: (update: (draft: AgentDraft) => AgentDraft) => void,
    fits: () => ReadonlyArray<Agent.EnvironmentChoice> | undefined,
  ): ConfigurationEditor => {
    const options = createMemo((): readonly AgentEnvironmentOption[] => {
      const checked = fits();
      const known = environments();
      if (checked === undefined)
        return [...known.values()].map((environment) => ({ ...environment, fit: undefined }));
      const pendingConnection = !(connectionOf(draft().connectionId)?.ready ?? true);
      return checked.flatMap((choice): readonly AgentEnvironmentOption[] => {
        const environment = known.get(choice.environmentId);
        if (!environment) return [];
        const compatibility = choice.compatibility;
        if (EnvironmentCompatibility.Compatibility.isAnyOf(["Compatible"])(compatibility))
          return [{ ...environment, fit: { kind: "works" } }];
        const blockers = compatibility.reasons
          .map((reason) =>
            EnvironmentCompatibility.Reason.isAnyOf(["EnvironmentNotReady"])(reason)
              ? undefined
              : issueCode(reason),
          )
          .filter((issue): issue is AgentIssue => issue !== undefined)
          .filter(blocker);
        if (blockers.length > 0)
          return [{ ...environment, fit: { kind: "cant-run", reasons: blockers } }];
        const issues = compatibility.reasons.flatMap((reason) =>
          EnvironmentCompatibility.Reason.isAnyOf(["EnvironmentNotReady"])(reason)
            ? reason.issues
            : [],
        );
        return [
          {
            ...environment,
            fit: {
              kind: "needs-setup",
              issues,
              connection:
                pendingConnection ||
                compatibility.reasons.some(
                  EnvironmentCompatibility.Reason.isAnyOf(["ConnectionNotReady"]),
                ),
            },
          },
        ];
      });
    });
    const chosen = () => options().find((option) => option.id === draft().environmentId);
    return {
      draft,
      setInstructions: (instructions) => change((current) => ({ ...current, instructions })),
      setConnection: (connectionId) =>
        change((current) => ({
          ...current,
          connectionId,
          model:
            current.model.trim() === ""
              ? (connectionOf(connectionId)?.models[0]?.id ?? "")
              : current.model,
        })),
      setModel: (model) => change((current) => ({ ...current, model })),
      setReasoning: (reasoning) => change((current) => ({ ...current, reasoning })),
      setEnvironment: (environmentId) => change((current) => ({ ...current, environmentId })),
      environments: options,
      environment: chosen,
      complete: () => {
        const current = draft();
        const environment = chosen();
        return (
          connectionOf(current.connectionId) !== undefined &&
          current.model.trim() !== "" &&
          environment !== undefined &&
          environment.fit?.kind !== "cant-run" &&
          (current.reasoning === undefined ||
            environment.reasoningLevels.includes(current.reasoning))
        );
      },
    };
  };
  const configurationOf = (draft: AgentDraft): AgentConfiguration | undefined =>
    draft.connectionId === undefined || draft.environmentId === undefined
      ? undefined
      : {
          instructions: draft.instructions.trim(),
          model: {
            connectionId: draft.connectionId,
            model: draft.model.trim(),
            reasoning: draft.reasoning ?? null,
          },
          environmentId: draft.environmentId,
        };

  // A new agent. Retrying the same request reuses its key, so an attempt whose response was lost
  // is not created twice.
  const [creating, setCreating] = createSignal<
    AgentDraft & { readonly name: string; readonly roleId: string | undefined }
  >();
  let intent:
    | { readonly body: string; readonly key: ReturnType<typeof newAgentRequestKey> }
    | undefined;
  const createDraft = () => creating() ?? blank();
  const blank = () => ({
    name: "",
    roleId: undefined,
    instructions: "",
    connectionId: undefined,
    model: "",
    reasoning: undefined,
    environmentId: undefined,
  });
  const createEditor = editor(
    createDraft,
    (update) => setCreating((current) => current && Object.assign({}, current, update(current))),
    choicesFor(creating),
  );
  const createRole = () => {
    const id = creating()?.roleId;
    return roles().find((role) => role.id === id)
      ? id
      : (roles().find((role) => role.id === memberRole) ?? roles()[0])?.id;
  };

  // Per agent: a rename keeps the name it was made against; configuration drafts keep their edits.
  const [names, setNames] = createSignal<
    Readonly<Record<string, { readonly name: string; readonly expected: string }>>
  >({});
  const [configs, setConfigs] = createSignal<Readonly<Record<string, AgentDraft>>>({});
  const forget = <A>(
    set: (update: (previous: Readonly<Record<string, A>>) => Readonly<Record<string, A>>) => void,
    agentId: string,
  ) =>
    set((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([id]) => id !== agentId)),
    );
  const savedDraft = (agentId: string): AgentDraft | undefined => {
    const entry = find(agentId);
    return (
      entry && {
        instructions: entry.instructions,
        connectionId: entry.connection.id,
        model: entry.model,
        reasoning: entry.reasoning,
        environmentId: entry.environment.id,
      }
    );
  };
  const configDraft = (agentId: string) => configs()[agentId] ?? savedDraft(agentId) ?? blank();
  const selectedId = () => options.selected?.();
  const selectedDraft = () => {
    const id = selectedId();
    return id === undefined ? undefined : configDraft(id);
  };
  const selectedFits = choicesFor(selectedDraft);
  // One editor per agent, owned by this view, so reading it again keeps the same choices.
  const owner = getOwner();
  const editors = new Map<string, ConfigurationEditor>();
  const configEditor = (agentId: string) => {
    const known = editors.get(agentId);
    if (known) return known;
    const created = runWithOwner(owner, () =>
      editor(
        () => configDraft(agentId),
        (update) =>
          setConfigs((previous) => ({ ...previous, [agentId]: update(configDraft(agentId)) })),
        () => (selectedId() === agentId ? selectedFits() : undefined),
      ),
    )!;
    editors.set(agentId, created);
    return created;
  };

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

  return {
    /** Why nothing shows yet; undefined once the agents have loaded. */
    status: (): "loading" | "failed" | "unavailable" | undefined => {
      if (loaded()) return undefined;
      if (!read) return "unavailable";
      const failure = read.failure();
      if (failure === undefined) return "loading";
      return failure === "denied" || failure === "gone" ? "unavailable" : "failed";
    },
    /** Every agent the reader may read, by name. */
    agents: all,
    agent: find,
    /** An agent's turns in progress, by where each runs. */
    turns: (agentId: string): readonly AgentTurnSummary[] => {
      const memberId = read?.agents()?.find((view) => view.id === agentId)?.memberId;
      return memberId === undefined
        ? []
        : activity
            .ofAgent(memberId)
            .flatMap((turn) =>
              turn.state === "queued" || turn.state === "working" || turn.state === "stopping"
                ? [{ id: turn.id, state: turn.state, where: turn.place }]
                : [],
            );
    },
    /** The connections agents can use for model access, ready ones first. */
    connections: () =>
      connections().toSorted((left, right) => Number(right.ready) - Number(left.ready)),
    /** Whether the connections have loaded, so an empty list means there are none. */
    connectionsLoaded: () => read?.connections() !== undefined,
    /** The roles the reader may give a new agent. */
    roles,
    /** The reader may add agents. */
    canCreate: () => canCreate() === true,
    /** The change running, or `refresh`. */
    pending: changes.pending,
    failure: (): AgentsFailure | undefined => changes.failure(),
    /** What the reader sees is out of date: changes wait for a refresh. */
    stale: changes.stale,
    /** Reload, on behalf of the change that found the values out of date, if any. */
    refresh: () => {
      if (!loaded()) read?.retry();
      else changes.refresh();
    },
    /** Set aside the last change's failure, as a dialog closes. */
    dismiss: changes.dismiss,
    create: {
      /**
       * Start an agent: Member, the first ready model connection and its first suggested model,
       * and the first environment.
       */
      begin: () => {
        changes.dismiss();
        intent = undefined;
        const connection = connections().find((candidate) => candidate.ready) ?? connections()[0];
        setCreating({
          name: "",
          roleId: undefined,
          instructions: "",
          connectionId: connection?.id,
          model: connection?.models[0]?.id ?? "",
          reasoning: undefined,
          environmentId: [...environments().keys()][0],
        });
      },
      /** An agent is being added, including while a detour creates a connection for it. */
      active: () => creating() !== undefined,
      name: () => creating()?.name ?? "",
      setName: (name: string) =>
        setCreating((current) => current && Object.assign({}, current, { name })),
      roleId: createRole,
      setRole: (roleId: string) =>
        setCreating((current) => current && Object.assign({}, current, { roleId })),
      configuration: createEditor,
      /** Everything is complete, so the agent can be created. */
      ready: () =>
        (creating()?.name.trim() ?? "") !== "" &&
        createRole() !== undefined &&
        createEditor.complete(),
      save: () => {
        const current = creating();
        const roleId = createRole();
        const configuration = current && configurationOf(current);
        if (!current || !roleId || !configuration) return;
        const input = { name: current.name.trim(), roleId, configuration };
        const serialized = JSON.stringify(input);
        if (intent?.body !== serialized) intent = { body: serialized, key: newAgentRequestKey() };
        send({ kind: "create", ...input, key: intent.key }, input.name);
      },
      cancel: () => {
        intent = undefined;
        setCreating(undefined);
      },
    },
    rename: {
      name: (agentId: string) => names()[agentId]?.name ?? find(agentId)?.name ?? "",
      setName: (agentId: string, name: string) =>
        setNames((previous) => ({
          ...previous,
          [agentId]: { name, expected: previous[agentId]?.expected ?? find(agentId)?.name ?? "" },
        })),
      /** The name differs from the one saved and can be saved now. */
      changed: (agentId: string) => {
        const name = names()[agentId]?.name.trim();
        return (
          !changes.stale() && name !== undefined && name !== "" && name !== find(agentId)?.name
        );
      },
      save: (agentId: string) => {
        const edit = names()[agentId];
        if (edit)
          send(
            { kind: "rename", agentId, name: edit.name.trim(), expectedName: edit.expected },
            edit.name.trim(),
          );
      },
    },
    configure: {
      /** Edits to an agent's configuration, kept until saved or reset. */
      configuration: configEditor,
      /** The configuration differs from the one saved, and can be saved now. */
      changed: (agentId: string) => {
        const edit = configs()[agentId];
        const saved = savedDraft(agentId);
        if (!edit || !saved || changes.stale()) return false;
        const next = configurationOf(edit);
        const current = configurationOf(saved);
        return (
          next !== undefined &&
          current !== undefined &&
          !sameConfiguration(next, current) &&
          configEditor(agentId).complete()
        );
      },
      save: (agentId: string) => {
        const edit = configs()[agentId];
        const configuration = edit && configurationOf(edit);
        if (configuration) send({ kind: "configure", agentId, configuration }, find(agentId)?.name);
      },
      /** Discard unsaved edits, such as when the details close. */
      reset: (agentId: string) => {
        forget(setConfigs, agentId);
        forget(setNames, agentId);
      },
    },
    remove: (agentId: string) => send({ kind: "remove", agentId }, find(agentId)?.name),
  };
}
export type AgentsView = ReturnType<typeof useAgents>;

function connect(reads: AgentsReads) {
  const agents = useAtomValue(() => reads.agents),
    connections = useAtomValue(() => reads.connections),
    connectionImplementations = useAtomValue(() => reads.connectionImplementations),
    environments = useAtomValue(() => reads.environments),
    environmentImplementations = useAtomValue(() => reads.environmentImplementations),
    settings = useAtomValue(() => reads.settings),
    retryAgents = useAtomRefresh(() => reads.agents),
    retryConnections = useAtomRefresh(() => reads.connections),
    retryEnvironments = useAtomRefresh(() => reads.environments);
  const value = <A, E>(read: AsyncResult.AsyncResult<A, E>) =>
    Option.getOrUndefined(AsyncResult.value(read));
  return {
    agents: () => value(agents()),
    /** The connections the reader may read; none while they load or when they cannot. */
    connections: () => value(connections()),
    connectionImplementations: () => value(connectionImplementations()),
    environments: () => value(environments()),
    environmentImplementations: () => value(environmentImplementations()),
    settings: () => value(settings()),
    /** Why the latest read of the agents failed, once it settles. */
    failure: () => {
      const cause = settled(agents());
      return cause === undefined ? undefined : workspaceFailure(cause);
    },
    retry: () => {
      retryAgents();
      retryConnections();
      retryEnvironments();
    },
    /** Reload the connections and environments a draft chooses from. */
    reloadChoices: () => {
      retryConnections();
      retryEnvironments();
    },
  };
}

/** A read of nothing, for a draft that names no model access yet. */
const nothing = Atom.make(AsyncResult.initial<ReadonlyArray<Agent.EnvironmentChoice>, unknown>());

/** The environment choices for a selection, live while it names model access. */
function choices(
  reads: AgentsReads,
  selection: () =>
    | { readonly connectionId: string; readonly model: string; readonly reasoning?: string }
    | undefined,
) {
  const result = useAtomValue(() => {
    const current = selection();
    return current === undefined
      ? nothing
      : (reads.environmentChoices({
          connectionId: current.connectionId as Parameters<
            AgentsReads["environmentChoices"]
          >[0]["connectionId"],
          model: current.model,
          reasoning: current.reasoning,
        }) as unknown as typeof nothing);
  });
  return () => Option.getOrUndefined(AsyncResult.value(result()));
}
