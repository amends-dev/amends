/**
 * What the gateway's tests add to the conformance support: the integrations their hosts install,
 * with a test harness, channel transport, and models, and jobs that record each request a commit
 * makes, so a test runs the turns and deliveries it expects itself.
 */
import { ChannelTransport } from "@amends-dev/channel";
import { Integration, Integrations, type ModelCatalog } from "@amends-dev/connection";
import { DeliveryJobs } from "@amends-dev/core/channel";
import { Store } from "@amends-dev/core/journal";
import type { Thread } from "@amends-dev/core/thread";
import { type Turn, TurnJobs } from "@amends-dev/core/turn";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { Harness as AgentHarness } from "@amends-dev/harness";
import type { Host, Storage } from "@amends-dev/gateway/conformance";
import { Context, Crypto, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Gateway, WorkspaceStorage } from "../src/index.ts";
import { bind } from "../src/conformance/Support.ts";

export * from "../src/conformance/Support.ts";

/** The key the test models integration's check accepts; any other it refuses. */
export const goodKey = "sk-good";

/** The model test models lists, which reasons with a low or high effort. */
export const testModel: ModelCatalog.Model = {
  id: "test-model",
  name: "Test model",
  protocol: "openai-chat",
  url: "https://models.example/v1",
  released: "2026-01",
  limits: { context: 100_000, output: 8_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] },
};

/**
 * The harness of an agent named `id` that no suite starts a session with: suites run turns
 * themselves, as a host's turn jobs would, through turn execution.
 */
const idleHarness = (id: string, requiresSandbox: boolean) =>
  Effect.succeed(
    AgentHarness.make({
      id,
      requiresSandbox,
      createSession: () => Effect.die("No suite starts a session"),
    }),
  );

/** A message the test channel transport posted to an external conversation. */
export interface PostedMessage {
  readonly conversation: ChannelTransport.Conversation;
  readonly outgoing: ChannelTransport.Outgoing;
  readonly messageId: ChannelTransport.ExternalId;
}

/** What the test channel transport posted and no suite has taken yet, in order. */
const postedMessages: Array<PostedMessage> = [];

/** The messages the test channel transport posted since the last take, in order. */
export const takePosted = Effect.sync(() => postedMessages.splice(0));

/**
 * The test channel transport, which the `test-channels` integration gives every connection: the
 * external system sends it what it received as JSON, the body being a `Received` as is, and it
 * records what it posts, naming each message `posted-N`. Its own id in the system is `bot`.
 */
const decodeReceived = Schema.decodeUnknownEffect(Schema.fromJsonString(ChannelTransport.Received));
export const testTransport: ChannelTransport.ChannelTransport = {
  self: ChannelTransport.ExternalId.make("bot"),
  receive: (inbound) =>
    decodeReceived(inbound.body).pipe(
      Effect.mapError(
        (error) =>
          new ChannelTransport.TransportError({
            reason: "rejected",
            description: "The body is not what the test system sends",
            cause: error,
          }),
      ),
    ),
  post: (conversation, outgoing) =>
    Effect.sync(() => {
      const messageId = ChannelTransport.ExternalId.make(`posted-${postedMessages.length + 1}`);
      postedMessages.push({ conversation, outgoing, messageId });
      return { messageId };
    }),
};
/**
 * The integrations the suites' hosts install: models at an endpoint a connection gives, reached
 * with a key or none, which list `testModel` and offer any other, and whose check accepts only
 * `goodKey`; tools that take no settings or key; a harness whose agent works only in a sandbox, and
 * one whose agent works in the host's process; sandboxes; and channels over `testTransport`. No
 * suite starts a session or makes a sandbox.
 */
export const testIntegrations = [
  Integration.make({
    id: "test-models",
    name: "Test models",
    docs: "https://models.example/docs",
    settings: Schema.Struct({
      endpoint: Schema.NonEmptyString.annotate({ title: "Endpoint" }),
      region: Schema.optionalKey(Schema.NonEmptyString),
    }),
    auth: ["apiKey", "none"],
    models: {
      listed: [testModel],
      unlisted: true,
      endpoint: ({ settings }, { model }) =>
        Result.succeed({
          provider: "test-models",
          model,
          protocol: "openai-chat",
          url: settings.endpoint,
        }),
    },
    check: ({ apiKey }) =>
      Effect.succeed(
        apiKey !== undefined && Redacted.value(apiKey) === goodKey
          ? { status: "healthy" as const }
          : { status: "unauthorized" as const, description: "The key was refused" },
      ),
  }),
  Integration.make({
    id: "test-tools",
    name: "Test tools",
    auth: ["none"],
    tools: () => Effect.die("No suite calls a tool"),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-harness",
    name: "Test harness",
    auth: ["none"],
    harnesses: { requiresSandbox: true, harness: () => idleHarness("test-harness", true) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-in-process",
    name: "Test in process",
    auth: ["none"],
    harnesses: { requiresSandbox: false, harness: () => idleHarness("test-in-process", false) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-sandboxes",
    name: "Test sandboxes",
    auth: ["none"],
    sandboxes: () => Effect.die("No suite makes a sandbox"),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-channels",
    name: "Test channels",
    auth: ["none"],
    channels: () => Effect.succeed(testTransport),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
];

/** What the suites' gateways install. */
export const installed = { integrations: testIntegrations };

/** A turn job request a commit made: to run an agent's work in a thread, or to stop its turn. */
export type TurnJobRequest =
  | { readonly kind: "run"; readonly memberId: Member.Id; readonly threadId: Thread.Id }
  | {
      readonly kind: "stop";
      readonly memberId: Member.Id;
      readonly threadId: Thread.Id;
      readonly turnId: Turn.Id;
    };

/** The turn job requests each workspace's commits made and no suite has taken yet, in order. */
const requestedTurnJobs = new Map<Workspace.Id, Array<TurnJobRequest>>();
const keepOnceCommitted = (workspaceId: Workspace.Id, request: TurnJobRequest) =>
  Effect.flatMap(Store.Transaction, (storeTransaction) =>
    storeTransaction.afterCommit(
      Effect.sync(() => {
        requestedTurnJobs.set(workspaceId, [
          ...(requestedTurnJobs.get(workspaceId) ?? []),
          request,
        ]);
      }),
    ),
  );

/**
 * Turn jobs the suites run themselves: a commit's requests are kept once it commits, and
 * `takeTurnJobs` hands them to the suite, which runs the turns through turn execution as a host's
 * turn jobs would.
 */
export const recordedTurnJobs = TurnJobs.TurnJobs.of({
  requestRun: ({ workspaceId, memberId, threadId }) =>
    keepOnceCommitted(workspaceId, { kind: "run", memberId, threadId }),
  requestStop: ({ workspaceId, memberId, threadId, turnId }) =>
    keepOnceCommitted(workspaceId, { kind: "stop", memberId, threadId, turnId }),
});
export const layerRecordedTurnJobs = Layer.succeed(TurnJobs.TurnJobs, recordedTurnJobs);

/** The delivery job requests each workspace's commits made and no suite has taken yet, in order. */
const requestedDeliveryJobs = new Map<Workspace.Id, Array<Thread.Id>>();

/**
 * Delivery jobs the suites run themselves: a commit's requests are kept once it commits, and
 * `takeDeliveryJobs` hands the threads to the suite, which delivers through delivery execution as a
 * host's delivery jobs would.
 */
export const recordedDeliveryJobs = DeliveryJobs.DeliveryJobs.of({
  requestDeliver: ({ workspaceId, threadId }) =>
    Effect.flatMap(Store.Transaction, (storeTransaction) =>
      storeTransaction.afterCommit(
        Effect.sync(() => {
          const requested = requestedDeliveryJobs.get(workspaceId) ?? [];
          if (!requested.includes(threadId))
            requestedDeliveryJobs.set(workspaceId, [...requested, threadId]);
        }),
      ),
    ),
});
export const layerRecordedDeliveryJobs = Layer.succeed(
  DeliveryJobs.DeliveryJobs,
  recordedDeliveryJobs,
);

/** The threads whose delivery the workspace's commits requested since the last take, in order. */
export const takeDeliveryJobs = (id: Workspace.Id) =>
  Effect.sync(() => {
    const requested = requestedDeliveryJobs.get(id) ?? [];
    requestedDeliveryJobs.delete(id);
    return requested;
  });

/** The turn job requests the workspace's commits made since the last take, in order. */
export const takeTurnJobs = (id: Workspace.Id) =>
  Effect.sync(() => {
    const requested = requestedTurnJobs.get(id) ?? [];
    requestedTurnJobs.delete(id);
    return requested;
  });

/**
 * A workspace's stores and signal hub, with the host's cryptography, the test integrations, and
 * jobs that record each request, so a test runs the turns and deliveries it expects itself.
 */
const withHostServices = (
  context: Context.Context<WorkspaceStorage.Bindings>,
  crypto: Crypto.Crypto,
) =>
  Effect.map(Integrations.make(testIntegrations), (integrations) =>
    bind(
      context.pipe(
        Context.add(Crypto.Crypto, crypto),
        Context.add(TurnJobs.TurnJobs, recordedTurnJobs),
        Context.add(DeliveryJobs.DeliveryJobs, recordedDeliveryJobs),
        Context.add(Integrations.Integrations, integrations),
      ),
    ),
  );

/** One workspace's stores and signals on a host, with the test integrations and recorded jobs. */
export const forWorkspace = (host: Context.Context<Host>, id: Workspace.Id) =>
  Effect.flatMap(Context.get(host, WorkspaceStorage.WorkspaceStorage).forWorkspace(id), (context) =>
    withHostServices(context, Context.get(host, Crypto.Crypto)),
  );

/** One workspace's stores and signals on the host in context, as a gateway's caller has it. */
export const boundTo = Effect.fnUntraced(function* (id: Workspace.Id) {
  const workspaceStorage = yield* WorkspaceStorage.WorkspaceStorage;
  const crypto = yield* Crypto.Crypto;
  return yield* withHostServices(yield* workspaceStorage.forWorkspace(id), crypto);
});

/** A gateway over a host, which installs the test integrations, or what `options` say. */
export const gateway = (host: Context.Context<Host>, options: Gateway.Options = installed) =>
  Gateway.layer(options).pipe(
    Layer.provideMerge(
      Layer.mergeAll(Layer.succeedContext(host), layerRecordedTurnJobs, layerRecordedDeliveryJobs),
    ),
  );

/** Run a program on a gateway over a new host, which stays open for the enclosing scope. */
export const runGateway = <A, E, R>(storage: Storage, program: Effect.Effect<A, E, R>) =>
  Effect.flatMap(storage.connect(), (host) => program.pipe(Effect.provide(gateway(host))));
