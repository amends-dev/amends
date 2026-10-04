/**
 * A Daytona sandbox provider creates each sandbox in Daytona's cloud, a Linux machine of its own,
 * which Daytona names by the sandbox's id. It reaches Daytona through Daytona's SDK, with the API
 * key of the organization the sandboxes belong to, and closes the SDK's client with its scope.
 *
 * A sandbox runs until it is stopped or destroyed. Daytona stops a sandbox that sees no requests
 * to its API for a while, and requests to the sandbox's ports do not count, so a sandbox would stop
 * under an agent that only serves a host through a port; the provider turns that off unless the
 * options set it. A port's endpoint is Daytona's preview URL for it, which takes the sandbox's
 * preview token in a header and passes the request's other headers on.
 */
import { Network, Sandbox, SandboxError, SandboxProvider } from "@amends/sandbox-v2";
import {
  Daytona,
  DaytonaAuthenticationError,
  DaytonaBadGatewayError,
  DaytonaConflictError,
  DaytonaConnectionError,
  DaytonaForbiddenError,
  DaytonaNotFoundError,
  DaytonaRateLimitError,
  type Sandbox as DaytonaSandbox,
  DaytonaServiceUnavailableError,
  DaytonaTimeoutError,
} from "@daytona/sdk";
import { Crypto, Effect, Exit, FileSystem, Layer, Redacted, Schedule } from "effect";
import * as Processes from "./Processes.ts";

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

/** The label that keeps a sandbox's ports, for `resume` to read. */
const portsLabel = "amends-ports";

/** States of a sandbox that Daytona has deleted or is deleting, which cannot be resumed. */
const deletedStates = new Set(["destroyed", "destroying"]);

/** States of a sandbox that is not running, from which `stop` has nothing to do. */
const stoppedStates = new Set(["stopped", "archived"]);

export const make = Effect.fn("DaytonaSandboxProvider.make")(function* (options: Options) {
  const crypto = yield* Crypto.Crypto;
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

  const openSandbox = Effect.fnUntraced(function* (
    sandbox: DaytonaSandbox,
    id: Sandbox.SandboxId,
    ports: ReadonlyArray<Network.Port>,
  ) {
    const workingDirectory = (yield* call(() => sandbox.getWorkDir())) ?? "/";
    return Sandbox.Sandbox.of({
      id,
      description: describe(workingDirectory, ports),
      workingDirectory,
      // TODO(in progress): Replaced by the file system over Daytona's file API, module 3.
      fileSystem: FileSystem.makeNoop({}),
      childProcessSpawner: yield* Processes.make(sandbox, workingDirectory).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
      ),
      ports,
      endpoint: (port, protocol) =>
        ports.includes(port)
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
                new SandboxError.NotFoundError({
                  description: `Port ${port} was not exposed when the sandbox was created`,
                }),
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
   * Creates the Daytona sandbox named `id`. One that fails after Daytona may have made it, as when
   * it does not start in time, is deleted, unless the name was taken by another.
   */
  const createSandbox = (id: Sandbox.SandboxId, ports: ReadonlyArray<Network.Port>) =>
    Effect.tryPromise({
      try: () =>
        daytona.create({
          name: id,
          labels: { [portsLabel]: ports.join(",") },
          autoStopInterval: options.autoStopInterval ?? 0,
          ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
        }),
      catch: (error) =>
        error instanceof DaytonaConflictError
          ? sandboxError(
              new SandboxError.AlreadyExistsError({
                description: `A sandbox named ${id} already exists`,
              }),
              error,
            )
          : fromDaytonaError(error),
    }).pipe(
      Effect.tapError((error) =>
        error.reason._tag === "AlreadyExistsError"
          ? Effect.void
          : call(() => daytona.get(id)).pipe(
              Effect.flatMap((sandbox) => call(() => sandbox.delete())),
              Effect.ignore,
            ),
      ),
    );

  // TODO(in progress): Create from the template's snapshot, preparing it once per identity, module 4.
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
    const { template } = createOptions;
    return yield* Effect.acquireUseRelease(
      createSandbox(id, ports),
      (sandbox) =>
        Effect.tap(openSandbox(sandbox, id, ports), (opened) =>
          template === undefined
            ? Effect.void
            : template.prepare.pipe(Effect.provide(Sandbox.layerServices(opened))),
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
    return yield* openSandbox(sandbox, id, portsOf(sandbox.labels));
  });

  return SandboxProvider.SandboxProvider.of({ create, resume });
});

export const layer = (options: Options) =>
  Layer.effect(SandboxProvider.SandboxProvider, make(options));

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

const describe = (workingDirectory: string, ports: ReadonlyArray<Network.Port>) =>
  [
    `Work in ${workingDirectory}, on a Linux machine of your own in Daytona's cloud, where commands start.`,
    ...(ports.length === 0
      ? []
      : [`Servers on ports ${ports.join(", ")} that listen on every interface are reachable.`]),
  ].join(" ");

/** Calls Daytona, failing with the sandbox error its failure amounts to. */
const call = <A>(request: () => Promise<A>) =>
  Effect.tryPromise({ try: request, catch: fromDaytonaError });

/**
 * Retries a change to a sandbox that Daytona refused because another change to it was in progress,
 * as one is after a network update, which Daytona applies after answering it.
 */
const retryConflicts = <A, R>(change: Effect.Effect<A, SandboxError.SandboxError, R>) =>
  Effect.retry(change, {
    while: (error) => error.cause instanceof DaytonaConflictError,
    schedule: Schedule.spaced("250 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
  });

const sandboxError = (reason: SandboxError.SandboxErrorReason, cause?: unknown) =>
  new SandboxError.SandboxError({ provider: "daytona", reason, cause });

const fromDaytonaError = (error: unknown) => sandboxError(reasonOf(error), error);

/** The sandbox error reason a failure of Daytona's SDK amounts to. */
const reasonOf = (error: unknown): SandboxError.SandboxErrorReason => {
  const description = error instanceof Error ? error.message : String(error);
  if (error instanceof DaytonaNotFoundError) return new SandboxError.NotFoundError({ description });
  if (error instanceof DaytonaAuthenticationError || error instanceof DaytonaForbiddenError) {
    return new SandboxError.AuthenticationError({ description });
  }
  if (
    error instanceof DaytonaRateLimitError ||
    error instanceof DaytonaTimeoutError ||
    error instanceof DaytonaConnectionError ||
    error instanceof DaytonaBadGatewayError ||
    error instanceof DaytonaServiceUnavailableError
  ) {
    return new SandboxError.UnavailableError({ description });
  }
  return new SandboxError.UnknownError({ description });
};
