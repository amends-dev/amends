import { Connection, Integration, Integrations, type ModelCatalog } from "@amends/connection-v2";
import { Harness, type Agent } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option, Redacted, Result } from "effect";
import { AgentV2 } from "../../src/agent-v2/agent.ts";
import { AgentV2Query } from "../../src/agent-v2/query.ts";
import { AgentV2Store } from "../../src/agent-v2/store.ts";
import { ConnectionV2 } from "../../src/connection-v2/connection.ts";
import { ConnectionV2CredentialStore } from "../../src/connection-v2/credential-store.ts";
import { ConnectionV2Store } from "../../src/connection-v2/store.ts";
import { Identity } from "../../src/identity/identity.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { MemberStore } from "../../src/workspace/member/store.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const workspaceId = Workspace.Id.make("workspace-one");

const listed: ModelCatalog.Model = {
  id: "model-one",
  name: "Model One",
  protocol: "openai-chat",
  url: "https://models.example/v1",
  released: "2026-01",
  limits: { context: 100_000, output: 8_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] },
};

/** What each harness the integrations made was given, in order. */
const madeWith: Array<Agent.Options> = [];

/** How many times a sandbox provider was run. */
let providersRun = 0;

/** A harness of an agent named `id`, which no test starts a session with. */
const harnessOf =
  (id: string, requiresSandbox: boolean) => (_access: unknown, options: Agent.Options) =>
    Effect.sync(() => {
      madeWith.push(options);
      return Harness.make({
        id,
        requiresSandbox,
        startSession: () => Effect.die("No test starts a session"),
      });
    });

const installed = Integrations.make([
  Integration.make({
    id: "in-process",
    name: "In process",
    auth: ["none"],
    harnesses: { requiresSandbox: false, harness: harnessOf("in-process", false) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "boxed",
    name: "Boxed",
    auth: ["none"],
    harnesses: { requiresSandbox: true, harness: harnessOf("boxed", true) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "models",
    name: "Models",
    auth: ["apiKey"],
    models: {
      listed: [listed],
      unlisted: false,
      endpoint: ({ apiKey }, { model, effort }) =>
        Result.succeed({
          provider: "models",
          model,
          protocol: "openai-chat",
          url: "https://models.example/v1",
          apiKey,
          ...(effort === undefined ? {} : { effort }),
        }),
    },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "boxes",
    name: "Boxes",
    auth: ["none"],
    sandboxes: () =>
      Effect.suspend(() => {
        providersRun += 1;
        return Effect.die("No test makes a sandbox");
      }),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
]);

const connection = (
  id: string,
  integration: string,
  createdAt: string,
  auth: Connection.AuthMethod = "none",
): ConnectionV2.Record => ({
  id: ConnectionV2.Id.make(id),
  workspaceId,
  integration,
  name: id,
  settings: {},
  auth,
  status: "active",
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe(createdAt),
});

const inProcess = connection("conn-in-process", "in-process", "2026-10-06T12:00:00.000Z");
const laterInProcess = connection("conn-later", "in-process", "2026-10-06T13:00:00.000Z");
const boxed = connection("conn-boxed", "boxed", "2026-10-06T11:00:00.000Z");
const models = connection("conn-models", "models", "2026-10-06T12:00:00.000Z", "apiKey");
const boxes = connection("conn-boxes", "boxes", "2026-10-06T12:00:00.000Z");

const agentMemberId = Member.Id.make("member-agent");
const agentId = AgentV2.Id.make("agent-one");

const agent = (fields: Partial<AgentV2.Record> = {}): AgentV2.Record => ({
  id: agentId,
  workspaceId,
  memberId: agentMemberId,
  instructions: "Review each change.",
  harness: { _tag: "Connection", connectionId: inProcess.id },
  model: { connectionId: models.id, id: "model-one", effort: "high" },
  sandbox: null,
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z"),
  ...fields,
});

interface World {
  readonly agent?: AgentV2.Record;
  readonly members?: ReadonlyArray<Member.Record>;
  readonly connections?: ReadonlyArray<ConnectionV2.Record>;
  readonly keys?: ReadonlyMap<ConnectionV2.Id, string>;
  /** Why this host keeps no credentials, when it keeps none. */
  readonly credentialsUnavailable?: string;
}

/** The agent's membership, active unless `status` says otherwise. */
const agentMember = (status: Member.Status = "active"): Member.Record => ({
  id: agentMemberId,
  workspaceId,
  identity: { _tag: "Agent", id: agentId },
  name: Member.Name.make("Reviewer"),
  status,
});

/** The query over a workspace holding what `world` says, by default the agent and every connection. */
const queryIn = (world: World = {}) => {
  const record = world.agent ?? agent();
  const members = new Map((world.members ?? [agentMember()]).map((member) => [member.id, member]));
  const connections = world.connections ?? [inProcess, laterInProcess, boxed, models, boxes];
  const keys = world.keys ?? new Map([[models.id, "sk-models"]]);
  const unused = (what: string) => () => Effect.die(`No test ${what}`);
  const stores = Layer.mergeAll(
    Layer.succeed(MemberStore.Service, {
      get: (memberId) => Effect.succeed(Option.fromUndefinedOr(members.get(memberId))),
      getMany: unused("reads several members"),
      findActive: unused("finds a membership"),
      list: Effect.die("No test lists members"),
      insert: unused("adds a member"),
      rename: unused("renames a member"),
      markRemoved: unused("removes a member"),
    }),
    Layer.succeed(AgentV2Store.Service, {
      get: (id) => Effect.succeed(id === record.id ? Option.some(record) : Option.none()),
      list: Effect.succeed([record]),
      insert: unused("adds an agent"),
      update: unused("changes an agent"),
    }),
    Layer.succeed(ConnectionV2Store.Service, {
      get: (id) =>
        Effect.succeed(Option.fromUndefinedOr(connections.find((found) => found.id === id))),
      listActive: Effect.succeed(connections),
      insert: unused("adds a connection"),
      update: unused("changes a connection"),
    }),
    Layer.succeed(ConnectionV2CredentialStore.Service, {
      set: unused("stores a key"),
      get: (connectionId) => {
        if (world.credentialsUnavailable !== undefined) {
          return Effect.fail(
            new ConnectionV2CredentialStore.Unavailable({ reason: world.credentialsUnavailable }),
          );
        }
        const key = keys.get(connectionId);
        return Effect.succeed(
          key === undefined ? Option.none() : Option.some({ apiKey: Redacted.make(key) }),
        );
      },
      remove: unused("removes a key"),
    }),
    Layer.effect(Integrations.Integrations, installed),
  );
  return AgentV2Query.make().pipe(Effect.provide(stores));
};

const selection = (fields: Partial<AgentV2.Selection> = {}): AgentV2.Selection => ({
  harness: { connectionId: inProcess.id },
  model: { connectionId: models.id, id: "model-one", effort: "high" },
  sandbox: null,
  ...fields,
});

describe("what an agent runs a turn on", () => {
  it.effect("is the agent's own harness, model, and sandbox", () =>
    Effect.gen(function* () {
      const agentV2Query = yield* queryIn({
        agent: agent({
          harness: { _tag: "Connection", connectionId: boxed.id },
          sandbox: { connectionId: boxes.id },
        }),
      });

      expect(yield* agentV2Query.select(agentMemberId, undefined)).toEqual(
        selection({ harness: { connectionId: boxed.id }, sandbox: { connectionId: boxes.id } }),
      );
    }),
  );

  it.effect(
    "on Auto, is the harness its last turn ran on while it can, and otherwise the oldest",
    () =>
      Effect.gen(function* () {
        const onAuto = agent({ harness: { _tag: "Auto" } });
        const agentV2Query = yield* queryIn({ agent: onAuto });
        const withoutLater = yield* queryIn({ agent: onAuto, connections: [inProcess, models] });
        const last = selection({ harness: { connectionId: laterInProcess.id } });

        // The boxed harness is older, but its agent works only in a sandbox, which this one lacks.
        expect(yield* agentV2Query.select(agentMemberId, undefined)).toEqual(selection());
        expect(yield* agentV2Query.select(agentMemberId, last)).toEqual(last);
        expect(yield* withoutLater.select(agentMemberId, last)).toEqual(selection());
      }),
  );

  it.effect("cannot be chosen for an agent that cannot run", () =>
    Effect.gen(function* () {
      const modelGone = yield* queryIn({ connections: [inProcess] });
      const noHarness = yield* queryIn({
        agent: agent({ harness: { _tag: "Auto" } }),
        connections: [boxed, models],
      });

      expect(yield* Effect.flip(modelGone.select(agentMemberId, undefined))).toMatchObject({
        _tag: "AgentV2Service.Incomplete",
        issues: [{ _tag: "Removed", part: "model" }],
      });
      expect(yield* Effect.flip(noHarness.select(agentMemberId, undefined))).toMatchObject({
        _tag: "AgentV2Service.Incomplete",
        issues: [{ _tag: "NoHarness" }],
      });
    }),
  );

  it.effect("is not found for a person, or an agent whose membership ended", () =>
    Effect.gen(function* () {
      const person: Member.Record = {
        id: Member.Id.make("member-person"),
        workspaceId,
        identity: { _tag: "Human", id: Identity.HumanId.make("alice") },
        status: "active",
      };
      const agentV2Query = yield* queryIn({
        members: [person, agentMember("removed")],
      });

      for (const memberId of [person.id, agentMemberId]) {
        expect(yield* Effect.flip(agentV2Query.select(memberId, undefined))).toEqual(
          new AgentV2Query.NotFound({ memberId }),
        );
      }
    }),
  );
});

describe("an agent ready to run", () => {
  it.effect(
    "has its instructions, its harness on the model with its key, and its sandboxes unrun",
    () =>
      Effect.gen(function* () {
        madeWith.length = 0;
        providersRun = 0;
        const agentV2Query = yield* queryIn();

        const runnable = yield* agentV2Query.buildRunnable(
          agentMemberId,
          selection({ harness: { connectionId: boxed.id }, sandbox: { connectionId: boxes.id } }),
        );

        expect(runnable.instructions).toBe("Review each change.");
        expect(runnable.harness.agent.id).toBe("boxed");
        expect(madeWith).toEqual([
          {
            model: {
              provider: "models",
              model: "model-one",
              protocol: "openai-chat",
              url: "https://models.example/v1",
              apiKey: expect.anything(),
              effort: "high",
            },
          },
        ]);
        expect(Redacted.value(madeWith[0]?.model.apiKey ?? Redacted.make(""))).toBe("sk-models");
        expect(providersRun).toBe(0);
        yield* Effect.exit(Effect.scoped(runnable.sandboxProvider ?? Effect.void));
        expect(providersRun).toBe(1);
      }),
  );

  it.effect("has no sandboxes for an agent that works without one", () =>
    Effect.gen(function* () {
      const agentV2Query = yield* queryIn();

      const runnable = yield* agentV2Query.buildRunnable(agentMemberId, selection());

      expect(runnable.harness.agent.id).toBe("in-process");
      expect(runnable.sandboxProvider).toBeUndefined();
    }),
  );

  it.effect("cannot be built when a connection of its selection is gone or has no key", () =>
    Effect.gen(function* () {
      const harnessGone = yield* queryIn({ connections: [models] });
      const keyless = yield* queryIn({ keys: new Map() });
      const keepsNoKeys = yield* queryIn({ credentialsUnavailable: "No key protects credentials" });

      expect(
        yield* Effect.flip(harnessGone.buildRunnable(agentMemberId, selection())),
      ).toMatchObject({
        _tag: "AgentV2Service.Incomplete",
        issues: [{ _tag: "Removed", part: "harness" }],
      });
      expect(yield* Effect.flip(keyless.buildRunnable(agentMemberId, selection()))).toMatchObject({
        _tag: "AgentV2Service.Incomplete",
        issues: [
          {
            _tag: "Invalid",
            part: "model",
            description: "The connection conn-models has no API key",
          },
        ],
      });
      expect(
        yield* Effect.flip(keepsNoKeys.buildRunnable(agentMemberId, selection())),
      ).toMatchObject({
        _tag: "AgentV2Service.Incomplete",
        issues: [{ _tag: "Invalid", part: "model", description: "No key protects credentials" }],
      });
    }),
  );
});
