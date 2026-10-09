/**
 * A Daytona sandbox provider creates each sandbox in Daytona's cloud, a Linux machine of its own,
 * which Daytona names by the sandbox's id. It reaches Daytona through Daytona's SDK, with the API
 * key of the organization the sandboxes belong to, and closes the SDK's client with its scope.
 *
 * A sandbox made from a template starts from a snapshot of the template's version once Daytona has
 * made one, and is prepared on its own until then, as `Snapshots` describes; snapshots still being
 * made when the provider's scope closes are left for the next create to make.
 *
 * A sandbox runs until it is stopped or destroyed. Daytona stops a sandbox that sees no requests
 * to its API for a while, and requests to the sandbox's ports do not count, so a sandbox would stop
 * under an agent that only serves a host through a port; the provider turns that off unless the
 * options set it. A port's endpoint is Daytona's preview URL for it, which takes the sandbox's
 * preview token in a header and passes the request's other headers on. Daytona opens a sandbox's
 * port the first time it gives its preview URL, so exposing a port only records it.
 *
 * `integration` gives the sandboxes of Daytona organizations to connections.
 */
import { Connection, Integration } from "@amends/connection";
import { Network, Sandbox, SandboxError, SandboxProvider, type Template } from "@amends/sandbox";
import {
  type CreateSandboxFromSnapshotParams,
  Daytona,
  DaytonaConflictError,
  DaytonaInternalServerError,
  type Sandbox as DaytonaSandbox,
} from "@daytona/sdk";
import {
  type Cause,
  Crypto,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
} from "effect";
import { call, fromDaytonaError, sandboxError } from "./Call.ts";
import * as Files from "./Files.ts";
import * as Processes from "./Processes.ts";
import * as Snapshots from "./Snapshots.ts";

export interface Options {
  /** The API key of the Daytona organization the sandboxes belong to. */
  readonly apiKey: Redacted.Redacted<string>;

  /** Daytona's API, when it is not that of Daytona's own cloud. */
  readonly apiUrl?: string;

  /** The region to create sandboxes in, such as `us` or `eu`, rather than the organization's. */
  readonly target?: string;

  /** The snapshot sandboxes start from, rather than Daytona's default. */
  readonly snapshot?: string;

  /**
   * Minutes without requests to Daytona's API, which requests to the sandbox's ports do not count
   * as, after which Daytona stops a sandbox. 0, the default, never stops it.
   */
  readonly autoStopInterval?: number;
}

/** The label that keeps the ports a sandbox exposes. */
const portsLabel = "amends-ports";

/** The label that names the template a sandbox prepares a version of. */
const templateLabel = "amends-template";

/** How long Daytona may take to make a snapshot of a prepared sandbox. */
const snapshotSeconds = 15 * 60;

/** States of a sandbox that Daytona has deleted or is deleting, which cannot be resumed. */
const deletedStates = new Set(["destroyed", "destroying"]);

/** States of a sandbox that is not running, from which `stop` has nothing to do. */
const stoppedStates = new Set(["stopped", "archived"]);

export const make = Effect.fn("DaytonaSandboxProvider.make")(function* (options: Options) {
  const crypto = yield* Crypto.Crypto;
  // Snapshots of templates are made in the background, until the provider closes.
  const scope = yield* Effect.scope;
  // The client holds a connection for sandboxes' events, which keeps a process running until the
  // client is disposed.
  const daytona = yield* Effect.acquireDisposable(
    Effect.sync(
      () =>
        new Daytona({
          apiKey: Redacted.value(options.apiKey),
          ...(options.apiUrl === undefined ? {} : { apiUrl: options.apiUrl }),
          ...(options.target === undefined ? {} : { target: options.target }),
        }),
    ),
  );

  const openSandbox = Effect.fnUntraced(function* (sandbox: DaytonaSandbox, id: Sandbox.SandboxId) {
    const workingDirectory = (yield* call(() => sandbox.getWorkDir())) ?? "/";
    /**
     * Whether the sandbox exposes `port`, as its label said when last read, or says now, for a
     * port exposed through another `Sandbox` of it since.
     */
    const isExposed = (port: Network.Port) =>
      portsOf(sandbox.labels).includes(port)
        ? Effect.succeed(true)
        : Effect.map(
            call(() => sandbox.refreshData()),
            () => portsOf(sandbox.labels).includes(port),
          );
    return Sandbox.Sandbox.of({
      id,
      description: describe(workingDirectory),
      workingDirectory,
      fileSystem: Files.make(sandbox, workingDirectory),
      childProcessSpawner: yield* Processes.make(sandbox, workingDirectory).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
      ),
      // TODO: Keep a port that another host exposes at the same moment, once Daytona changes one
      // label at a time: `setLabels` replaces them all, so the last of two changes wins.
      exposePorts: (ports) =>
        retryConflicts(
          Effect.gen(function* () {
            yield* call(() => sandbox.refreshData());
            const exposed = portsOf(sandbox.labels);
            const added = ports.filter((port) => !exposed.includes(port));
            if (added.length === 0) return;
            yield* call(() =>
              sandbox.setLabels({
                ...sandbox.labels,
                [portsLabel]: [...exposed, ...added].join(","),
              }),
            );
          }),
        ),
      endpoint: (port, protocol) =>
        Effect.flatMap(isExposed(port), (exposed) =>
          exposed
            ? Effect.map(
                call(() => sandbox.getPreviewLink(port)),
                (link): Network.Endpoint => ({
                  url: protocol === "ws" ? link.url.replace(/^http/, "ws") : link.url,
                  headers:
                    link.token === undefined
                      ? {}
                      : { "x-daytona-preview-token": Redacted.make(link.token) },
                }),
              )
            : Effect.fail(
                sandboxError(
                  new SandboxError.NotFoundError({ description: `Port ${port} is not exposed` }),
                ),
              ),
        ),
      // A sandbox another call is stopping or destroying refuses the request until it has, and
      // is then found stopped or destroyed when the request is retried.
      stop: retryConflicts(
        Effect.andThen(
          call(() => sandbox.refreshData()),
          () => (stoppedStates.has(sandbox.state ?? "") ? Effect.void : call(() => sandbox.stop())),
        ),
      ),
      destroy: retryConflicts(
        Effect.andThen(
          call(() => sandbox.refreshData()),
          () =>
            deletedStates.has(sandbox.state ?? "") ? Effect.void : call(() => sandbox.delete()),
        ),
      ).pipe(
        Effect.catchIf(
          (error) => error.reason._tag === "NotFoundError",
          () => Effect.void,
        ),
      ),
      // TODO: Close the moment, just after Daytona answers, in which a sandbox that was denied
      // everything reaches anything while an allow list replaces the denial, once a sandbox's
      // policy changes while code that should not get out runs in it. Daytona's runner lifts the
      // block before it filters by the list, and denies no block together with a list.
      setNetworkPolicy: (policy) =>
        Effect.flatMap(networkSettingsOf(policy), (settings) =>
          retryConflicts(call(() => sandbox.updateNetworkSettings(settings))),
        ),
      // TODO: Set credentials outside the sandbox with Daytona's secrets, which its proxy puts in
      // outbound requests in place of placeholders, once their matching is checked against ours.
      addRequestTransformations: () =>
        Effect.fail(
          sandboxError(
            new SandboxError.UnsupportedError({
              description: "The Daytona provider transforms no requests yet",
            }),
          ),
        ),
    });
  });

  /**
   * Creates the Daytona sandbox named `name`, failing with `AlreadyExistsError` when the name is
   * taken. One that fails after Daytona may have made it, as when it does not start in time, is
   * deleted.
   */
  const createSandbox = (name: string, params: Omit<CreateSandboxFromSnapshotParams, "name">) =>
    Effect.tryPromise({
      try: () => daytona.create({ name, ...params }),
      catch: (error) =>
        error instanceof DaytonaConflictError
          ? sandboxError(
              new SandboxError.AlreadyExistsError({
                description: `A sandbox named ${name} already exists`,
              }),
              error,
            )
          : fromDaytonaError(error),
    }).pipe(
      Effect.tapError((error) =>
        error.reason._tag === "AlreadyExistsError"
          ? Effect.void
          : call(() => daytona.get(name)).pipe(
              Effect.flatMap((sandbox) => call(() => sandbox.delete())),
              Effect.ignore,
            ),
      ),
    );

  /**
   * Prepares `template` in a sandbox named `name`, which then becomes the snapshot of that name and
   * is deleted. Succeeds with `false`, making nothing, when another create has claimed the name.
   */
  const makeSnapshot =
    <E>(template: Template.Template<E>) =>
    (name: string) =>
      Effect.acquireUseRelease(
        createSandbox(name, {
          labels: { [templateLabel]: template.name },
          autoStopInterval: 0,
          ttlMinutes: Snapshots.claimMinutes,
          ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
        }),
        (sandbox) =>
          openSandbox(sandbox, Sandbox.SandboxId.make(name)).pipe(
            Effect.flatMap((opened) =>
              template.prepare.pipe(Effect.provide(Sandbox.layerServices(opened))),
            ),
            Effect.andThen(call(() => sandbox.createSnapshot(name, snapshotSeconds))),
            Effect.as(true),
          ),
        (sandbox) => Effect.ignore(call(() => sandbox.delete())),
      ).pipe(
        Effect.catchIf(
          (error) =>
            error instanceof SandboxError.SandboxError &&
            error.reason._tag === "AlreadyExistsError",
          () => Effect.succeed(false),
        ),
      );

  const create = Effect.fn("DaytonaSandboxProvider.create")(function* <E = never>(
    createOptions: SandboxProvider.CreateOptions<E> = {},
  ) {
    const id =
      createOptions.id ??
      Sandbox.SandboxId.make(
        yield* crypto.randomUUIDv4.pipe(
          Effect.mapError((cause) =>
            sandboxError(new SandboxError.UnknownError({ description: cause.message }), cause),
          ),
        ),
      );
    const ports = createOptions.ports ?? [];
    const { template, networkPolicy } = createOptions;
    // A policy Daytona cannot enforce fails before anything is created.
    const networkSettings =
      networkPolicy === undefined ? undefined : yield* networkSettingsOf(networkPolicy);
    const templateSnapshot =
      template === undefined
        ? Option.none<string>()
        : yield* Snapshots.find(
            daytona,
            scope,
            template,
            options.snapshot,
            makeSnapshot(template),
          ).pipe(Effect.provideService(Crypto.Crypto, crypto));
    const snapshot = Option.getOrElse(templateSnapshot, () => options.snapshot);
    // Until the template's snapshot is made, each sandbox is prepared on its own, before its
    // network policy applies, as preparing may download what the template installs.
    const preparesHere = template !== undefined && Option.isNone(templateSnapshot);
    return yield* Effect.acquireUseRelease(
      createSandbox(id, {
        labels: { [portsLabel]: ports.join(",") },
        autoStopInterval: options.autoStopInterval ?? 0,
        ...(snapshot === undefined ? {} : { snapshot }),
        // Daytona applies a policy it is created with before the sandbox starts.
        ...(preparesHere ? {} : networkSettings),
      }),
      (sandbox) =>
        Effect.tap(openSandbox(sandbox, id), (opened) =>
          preparesHere
            ? template.prepare.pipe(
                Effect.provide(Sandbox.layerServices(opened)),
                // TODO: Close the moment after create returns in which a sandbox prepared on its
                // own still reaches what its policy denies, once code that should not get out runs
                // in such a sandbox at once: Daytona applies an update a moment after it answers.
                Effect.andThen(
                  networkSettings === undefined
                    ? Effect.void
                    : retryConflicts(call(() => sandbox.updateNetworkSettings(networkSettings))),
                ),
              )
            : Effect.void,
        ),
      // A failed create leaves no sandbox behind to resume.
      (sandbox, exit) =>
        Exit.isSuccess(exit) ? Effect.void : Effect.ignore(call(() => sandbox.delete())),
    );
  });

  const resume = Effect.fn("DaytonaSandboxProvider.resume")(function* (id: Sandbox.SandboxId) {
    const sandbox = yield* call(() => daytona.get(id));
    if (deletedStates.has(sandbox.state ?? "")) {
      return yield* sandboxError(
        new SandboxError.NotFoundError({ description: `The sandbox ${id} was destroyed` }),
      );
    }
    if (sandbox.state !== "started") yield* retryConflicts(call(() => sandbox.start()));
    return yield* openSandbox(sandbox, id);
  });

  return SandboxProvider.SandboxProvider.of({ create, resume });
});

export const layer = (options: Options) =>
  Layer.effect(SandboxProvider.SandboxProvider, make(options));

/**
 * The integration of Daytona. A connection to it is an organization, which authenticates with its
 * API key, and may give Daytona's API, when it is not that of Daytona's own cloud, and the region to
 * create sandboxes in. Checking a connection asks Daytona for one of the organization's sandboxes,
 * which it lists only for a valid key, and creates nothing.
 */
export const integration = Effect.map(Crypto.Crypto, (crypto) =>
  Integration.make({
    id: "daytona",
    name: "Daytona",
    docs: "https://www.daytona.io/docs",
    settings: Schema.Struct({
      apiUrl: Schema.optionalKey(Schema.NonEmptyString).annotate({
        title: "API URL",
        description: "Daytona's API, when it is not that of Daytona's own cloud.",
      }),
      target: Schema.optionalKey(Schema.NonEmptyString).annotate({
        title: "Target",
        description: "The region to create sandboxes in, rather than the organization's.",
      }),
    }),
    auth: ["apiKey"],
    sandboxes: ({ settings, apiKey }) =>
      make({ apiKey, ...settings }).pipe(Effect.provideService(Crypto.Crypto, crypto)),
    check: ({ settings, apiKey }) =>
      Effect.acquireDisposable(
        Effect.sync(() => new Daytona({ apiKey: Redacted.value(apiKey), ...settings })),
      ).pipe(
        Effect.flatMap((daytona) => call(() => daytona.list({ limit: 1 }).next())),
        Effect.as<Connection.Health>({ status: "healthy" }),
        Effect.timeout("15 seconds"),
        Effect.catch((error) => Effect.succeed(healthOfFailure(error))),
        Effect.scoped,
      ),
  }),
);

/**
 * What Daytona's failing to list an organization's sandboxes says of the connection: refusing the
 * key, being unable to answer now, as when it fails itself, or anything else, as not knowing the
 * request.
 */
const healthOfFailure = (
  error: SandboxError.SandboxError | Cause.TimeoutError,
): Connection.Health => {
  if (!(error instanceof SandboxError.SandboxError)) {
    return { status: "unavailable", description: "Daytona did not answer in 15 seconds" };
  }
  const { reason } = error;
  switch (reason._tag) {
    case "AuthenticationError":
      return { status: "unauthorized", description: reason.message };
    case "UnavailableError":
      return { status: "unavailable", description: reason.message };
    default:
      return error.cause instanceof DaytonaInternalServerError
        ? { status: "unavailable", description: reason.message }
        : { status: "misconfigured", description: reason.message };
  }
};

/** The ports a sandbox's label names. */
const portsOf = (labels: Readonly<Record<string, string>>): ReadonlyArray<Network.Port> =>
  (labels[portsLabel] ?? "")
    .split(",")
    .filter((port) => port !== "")
    .map((port) => Network.Port.make(Number(port)));

/**
 * The network settings that replace a sandbox's with `policy`. Daytona keeps a setting an update
 * leaves out, so each policy sets all three, and a list that allows nothing blocks everything.
 * Daytona allows either hosts or CIDR ranges, and denies none.
 */
const networkSettingsOf = (policy: Network.NetworkPolicy) => {
  switch (policy._tag) {
    case "AllowAll":
      return Effect.succeed({ networkBlockAll: false, domainAllowList: "", networkAllowList: "" });
    case "DenyAll":
      return Effect.succeed({ networkBlockAll: true, domainAllowList: "", networkAllowList: "" });
    case "AllowList": {
      const { allowedHosts, allowedCidrs, deniedCidrs } = policy;
      if (deniedCidrs.length > 0 || (allowedHosts.length > 0 && allowedCidrs.length > 0)) {
        return Effect.fail(
          sandboxError(
            new SandboxError.UnsupportedError({
              description: "Daytona allows either hosts or CIDR ranges, and denies none",
            }),
          ),
        );
      }
      return Effect.succeed({
        networkBlockAll: allowedHosts.length === 0 && allowedCidrs.length === 0,
        domainAllowList: allowedHosts.join(","),
        networkAllowList: allowedCidrs.join(","),
      });
    }
  }
};

const describe = (workingDirectory: string) =>
  `Work in ${workingDirectory}, on a Linux machine of your own in Daytona's cloud, where commands start.`;

/**
 * Retries a change to a sandbox that Daytona refused because another change to it was in progress,
 * as one is after a network update, which Daytona applies after answering it.
 */
const retryConflicts = <A, R>(change: Effect.Effect<A, SandboxError.SandboxError, R>) =>
  Effect.retry(change, {
    while: (error) => error.cause instanceof DaytonaConflictError,
    schedule: Schedule.spaced("250 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
  });
