import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Api,
  Authentication,
  ConnectionImplementation,
  Environment,
  SandboxImplementation,
  type ThreadTimeline,
  Turn,
} from "@amends/api-http";

import { BuiltinRoles } from "@amends/core/authorization";
import { Group } from "@amends/core/group";
import { Identity } from "@amends/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Effect, Fiber, Layer, Redacted, Schedule, Stream } from "effect";
import { Base64 } from "effect/encoding";
import { Daytona } from "@daytona/sdk";
import { HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { setup } from "./database.ts";
import { withServer } from "./server.ts";

const alice = Identity.HumanId.make("alice");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
/**
 * The real routes, gateway, PostgreSQL storage, and turn runner behind a Bun test server, with
 * local sandboxes in `sandboxDirectory`, and connections' keys sealed with `credentialKey`.
 */
const server = (
  url: string,
  sandboxDirectory?: string,
  credentialKey?: Redacted.Redacted<string>,
) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url), {
          pollInterval: "100 millis",
          sandboxDirectory,
          credentialKey,
        }),
        DevelopmentAuthentication.layer(() => Effect.void).pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );

/** What the fake provider does with one request: answer it, refuse it, or hold it open. */
type Reply =
  | { readonly answer: string }
  | { readonly refuse: number }
  | { readonly hold: Promise<void>; readonly answer?: string };

/**
 * A model provider speaking OpenAI's chat completions, which handles each request with the next
 * reply, repeating the last, and keeps each request's messages.
 */
const fakeModels = (...replies: ReadonlyArray<Reply>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const requests: Array<{ readonly role: string; readonly content: unknown }[]> = [];
      const chunk = (choice: object, extra: object = {}) =>
        `data: ${JSON.stringify({ id: "c1", model: "fake-model", created: 0, choices: [choice], ...extra })}\n\n`;
      const models = Bun.serve({
        port: 0,
        fetch: async (request) => {
          if (new URL(request.url).pathname !== "/v1/chat/completions")
            return new Response("Not found", { status: 404 });
          const body = (await request.json()) as {
            readonly messages: Array<{ readonly role: string; readonly content: unknown }>;
          };
          requests.push(body.messages);
          const reply = replies[Math.min(requests.length, replies.length) - 1]!;
          if ("refuse" in reply)
            return Response.json(
              { error: { message: "Incorrect API key provided.", type: "invalid_request_error" } },
              { status: reply.refuse },
            );
          if ("hold" in reply) await reply.hold;
          const answer = "answer" in reply ? reply.answer : "Released.";
          return new Response(
            chunk({
              index: 0,
              delta: { role: "assistant", content: answer },
              finish_reason: null,
            }) +
              chunk(
                { index: 0, delta: {}, finish_reason: "stop" },
                { usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } },
              ) +
              "data: [DONE]\n\n",
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      });
      return { baseUrl: `${models.url.origin}/v1`, requests, stop: () => models.stop(true) };
    }),
    (models) => Effect.promise(models.stop),
  );

/**
 * Alice's workspace with Scout, an agent whose model connection is the fake provider, in the
 * environment every workspace starts with or one with this sandbox.
 */
const workspaceWithScout = (baseUrl: string, sandbox?: Environment.NewSandbox) =>
  Effect.gen(function* () {
    const asAlice = yield* client(alice);
    const workspace = yield* asAlice.workspaces.create({
      headers: {},
      payload: { name: "Studio" },
    });
    const workspaceId = workspace.id;
    const connection = yield* asAlice.connections.create({
      params: { workspaceId },
      headers: {},
      payload: {
        name: "Local models",
        implementationId: ConnectionImplementation.Id.make("openai-compatible"),
        settings: { baseUrl },
        authentication: "None",
      },
    });
    const environment =
      sandbox === undefined
        ? undefined
        : yield* asAlice.environments.create({
            params: { workspaceId },
            headers: {},
            payload: { name: "Sandboxed", harnessId: Environment.inProcessHarness, sandbox },
          });
    const agent = yield* asAlice.agents.create({
      params: { workspaceId },
      headers: {},
      payload: {
        name: "Scout",
        instructions: "Answer in one sentence.",
        model: { connectionId: connection.id, model: "fake-model", reasoning: null },
        environmentId: environment?.id ?? Environment.InProcessId,
        roleId: BuiltinRoles.MemberId,
      },
    });
    /** Ask Scout in a new thread of the general group. */
    const ask = (text: string) =>
      asAlice.threads.start({
        params: { workspaceId, groupId: Group.GeneralId },
        headers: {},
        payload: { text, mentions: [agent.memberId] },
      });
    return { asAlice, workspaceId, agent, ask };
  });

/** Read again every 200 ms until `until` holds, for at most 20 seconds. */
const until = <A, E, R>(read: Effect.Effect<A, E, R>, done: (value: A) => boolean) =>
  read.pipe(Effect.repeat({ until: done, schedule: Schedule.spaced("200 millis"), times: 100 }));

const texts = (items: ReadonlyArray<ThreadTimeline.Item>) =>
  items.flatMap((item) => ("message" in item ? [item.message.text] : []));

/** A directory for one test's local sandboxes, removed afterwards. */
const sandboxDirectory = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), "amends-host-sandboxes-"))),
  (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
);

/** Call `read` every 200 ms until `done` holds, for at most 30 seconds. */
const poll = async <A>(read: () => Promise<A>, done: (value: A) => boolean) => {
  for (let attempt = 0; ; attempt++) {
    const value = await read();
    if (done(value)) return value;
    if (attempt === 150) throw new Error(`Still waiting, with ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "an agent asked in a thread runs a turn with its model and replies there",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const models = yield* fakeModels({ answer: "The plan is on track." });
          const { asAlice, workspaceId, agent, ask } = yield* workspaceWithScout(models.baseUrl);
          const started = yield* ask("Scout, how is the plan going?");
          const threadId = started.thread.id;
          // The agent accepts the mention in the background, and its turn runs on the host's
          // cluster, closing with the reply.
          const timeline = yield* until(
            asAlice.threads.timeline({ params: { workspaceId, threadId }, query: { limit: 10 } }),
            (items) => texts(items).length === 2,
          );

          expect(texts(timeline)).toEqual([
            "Scout, how is the plan going?",
            "The plan is on track.",
          ]);
          // The turn shows where Scout took the question on, and ends with its reply.
          expect(timeline.map((item) => item.activity.kind)).toEqual([
            "message.published",
            "turn.created",
            "turn.started",
            "message.published",
            "turn.ended",
          ]);
          const reply = timeline.at(-2);
          expect(reply).toMatchObject({
            message: { author: { _tag: "Member", memberId: agent.memberId } },
          });
          expect(models.requests).toHaveLength(1);
          expect(models.requests[0]).toMatchObject([
            { role: "system", content: "Answer in one sentence." },
            { role: "user" },
          ]);
          expect(JSON.stringify(models.requests[0]?.[1])).toContain(
            "Scout, how is the plan going?",
          );
          // Its readers follow the turn over HTTP: it closed with that reply.
          const [turn] = yield* asAlice.turns.listByThread({
            params: { workspaceId, threadId },
            query: { limit: 10 },
          });
          expect(turn).toMatchObject({
            memberId: agent.memberId,
            status: "completed",
            messageIds: [reply !== undefined && "message" in reply ? reply.message.id : undefined],
            stoppable: false,
            retryable: false,
          });
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    30_000,
  );

  it.live(
    "a reader follows a turn's log over HTTP as its agent answers, until the turn ends",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const release = Promise.withResolvers<void>();
          const models = yield* fakeModels({
            hold: release.promise,
            answer: "The plan is on track.",
          });
          const { asAlice, workspaceId, ask } = yield* workspaceWithScout(models.baseUrl);
          const started = yield* ask("Scout, how is the plan going?");
          const turnsNow = asAlice.turns.listByThread({
            params: { workspaceId, threadId: started.thread.id },
            query: { limit: 10 },
          });
          // Follow while the model holds its answer.
          const [turn] = yield* until(turnsNow, () => models.requests.length === 1);
          const stream = yield* asAlice.turns.watchLog({
            params: { workspaceId, turnId: turn!.id },
          });
          const following = yield* Effect.forkScoped(Stream.runCollect(stream));
          release.resolve();
          const messages = yield* Fiber.join(following);

          // It opens with the log as it stands, carries each change, and closes after the end.
          expect(messages[0]?._tag).toBe("Opened");
          expect(messages.at(-1)?._tag).toBe("Ended");
          let items: Array<Turn.LogItem> = [];
          for (const message of messages)
            if (Turn.LogMessage.isAnyOf(["Opened"])(message)) items = [...message.items];
            else if (Turn.LogMessage.isAnyOf(["Changed"])(message))
              for (const { index, item } of message.changes) items[index] = item;
          expect(items).toMatchObject([
            { _tag: "InputTaken", messages: 1 },
            { _tag: "Responded", text: "The plan is on track.", reply: true },
          ]);
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    40_000,
  );

  it.live(
    "a question asked while the agent answers another gets its own answer, and both are posted",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const release = Promise.withResolvers<void>();
          const models = yield* fakeModels(
            { hold: release.promise, answer: "The deploy is on Thursday." },
            { answer: "The budget is fine." },
          );
          const { asAlice, workspaceId, ask } = yield* workspaceWithScout(models.baseUrl);
          const started = yield* ask("Scout, when is the deploy?");
          const params = { workspaceId, threadId: started.thread.id };
          const turnsNow = asAlice.turns.listByThread({ params, query: { limit: 10 } });
          yield* until(turnsNow, () => models.requests.length === 1);
          const asked = yield* asAlice.threads.publish({
            params,
            headers: {},
            payload: { text: "Also, how is the budget?", mentions: [] },
          });
          const sofar = yield* asAlice.threads.timeline({ params, query: { limit: 50 } });
          const askedAt = sofar.find((item) => "message" in item && item.message.id === asked.id)!
            .activity.sequence;
          // Scout takes the new question into the turn it is working on, then finishes the first.
          yield* until(turnsNow, (turns) => (turns[0]?.acceptedThroughSequence ?? 0) >= askedAt);
          release.resolve();
          const [done] = yield* until(turnsNow, (turns) => turns[0]?.status === "completed");

          const timeline = yield* asAlice.threads.timeline({ params, query: { limit: 10 } });
          expect(texts(timeline)).toEqual([
            "Scout, when is the deploy?",
            "Also, how is the budget?",
            "The deploy is on Thursday.",
            "The budget is fine.",
          ]);
          expect(done?.messageIds).toHaveLength(2);
          // The second request continues from the first answer, then the new question.
          expect(JSON.stringify(models.requests[1]?.at(-2))).toContain(
            "The deploy is on Thursday.",
          );
          expect(JSON.stringify(models.requests[1]?.at(-1))).toContain("Also, how is the budget?");
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    40_000,
  );

  it.live(
    "a turn that failed runs again when retried, and a running one stops when asked",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const release = Promise.withResolvers<void>();
          // The key is refused first; once it works, the next answer arrives only when released.
          const models = yield* fakeModels(
            { refuse: 401 },
            { answer: "The plan is on track." },
            { hold: release.promise },
          );
          const { asAlice, workspaceId, ask } = yield* workspaceWithScout(models.baseUrl);
          const started = yield* ask("Scout, how is the plan going?");
          const params = { workspaceId, threadId: started.thread.id };
          const turnsNow = asAlice.turns.listByThread({ params, query: { limit: 10 } });

          const [failed] = yield* until(turnsNow, (turns) => turns[0]?.status === "failed");
          expect(failed).toMatchObject({ stoppable: false, retryable: true });
          expect(failed?.failure).toBeTruthy();
          const retried = yield* asAlice.turns.retry({
            params: { workspaceId, turnId: failed!.id },
          });
          expect(retried).toMatchObject({ status: "queued", retryable: false });
          const [replied] = yield* until(turnsNow, (turns) => turns[0]?.status === "completed");
          expect(replied?.id).toBe(retried.id);
          const timeline = yield* asAlice.threads.timeline({ params, query: { limit: 10 } });
          expect(texts(timeline)).toEqual([
            "Scout, how is the plan going?",
            "The plan is on track.",
          ]);
          // The failed turn was retried once; asking again returns the retry that replied.
          expect(
            (yield* asAlice.turns.retry({ params: { workspaceId, turnId: failed!.id } })).id,
          ).toBe(retried.id);

          // Asked again, Scout works until stopped; the held answer never becomes a reply.
          const again = yield* ask("Scout, and the budget?");
          const againParams = { workspaceId, threadId: again.thread.id };
          const working = asAlice.turns.listByThread({ params: againParams, query: { limit: 10 } });
          const [running] = yield* until(
            working,
            (turns) => turns[0]?.status === "running" && models.requests.length === 3,
          );
          expect(running).toMatchObject({ stoppable: true, retryable: false });
          const stopping = yield* asAlice.turns.cancel({
            params: { workspaceId, turnId: running!.id },
          });
          expect(stopping).toMatchObject({ status: "cancelling", stoppable: false });
          const [stopped] = yield* until(working, (turns) => turns[0]?.status === "cancelled");
          expect(stopped).toMatchObject({ cancelReason: "requested", retryable: true });
          release.resolve();
          expect(
            texts(yield* asAlice.threads.timeline({ params: againParams, query: { limit: 10 } })),
          ).toEqual(["Scout, and the budget?"]);
          expect(
            yield* Effect.flip(
              asAlice.turns.cancel({ params: { workspaceId, turnId: running!.id } }),
            ),
          ).toMatchObject({ _tag: "TurnService.NotActive", status: "cancelled" });
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    40_000,
  );

  it.live(
    "an agent whose harness runs inside a local sandbox replies the same way",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const directory = yield* sandboxDirectory;
          yield* Effect.gen(function* () {
            const models = yield* fakeModels({ answer: "The plan is on track." });
            const { asAlice, workspaceId, ask } = yield* workspaceWithScout(models.baseUrl, {
              providerId: SandboxImplementation.Id.make("local"),
              harness: "in-sandbox",
              connectionId: null,
              template: null,
              env: {},
              setup: ["echo ready > setup.txt"],
              retention: "destroy",
            });
            const started = yield* ask("Scout, how is the plan going?");
            const params = { workspaceId, threadId: started.thread.id };
            const turnsNow = asAlice.turns.listByThread({ params, query: { limit: 10 } });
            // The turn spawns a sandbox, uploads the harness server into it, and runs amends's
            // harness there, which asks the same model.
            yield* until(turnsNow, (turns) => turns[0]?.status === "completed");

            const timeline = yield* asAlice.threads.timeline({ params, query: { limit: 10 } });
            expect(texts(timeline)).toEqual([
              "Scout, how is the plan going?",
              "The plan is on track.",
            ]);
            expect(models.requests[0]).toMatchObject([
              { role: "system", content: "Answer in one sentence." },
              { role: "user" },
            ]);
            // The environment's retention destroys the sandbox once the turn ends.
            const sandboxes = Effect.sync(() => readdirSync(join(directory, "sandboxes")));
            expect(yield* until(sandboxes, (entries) => entries.length === 0)).toEqual([]);
          }).pipe(Effect.provide(server(url, directory)));
        }).pipe(Effect.scoped),
      ),
    40_000,
  );
  it.live(
    "a turn whose sandbox is destroyed continues in a new one, and the agent is told its files are gone",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const directory = yield* sandboxDirectory;
          yield* Effect.gen(function* () {
            const release = Promise.withResolvers<void>();
            const models = yield* fakeModels(
              { hold: release.promise },
              { answer: "The plan is on track." },
            );
            const { asAlice, workspaceId, ask } = yield* workspaceWithScout(models.baseUrl, {
              providerId: SandboxImplementation.Id.make("local"),
              harness: "in-sandbox",
              connectionId: null,
              template: null,
              env: {},
              setup: [],
              retention: "destroy",
            });
            const started = yield* ask("Scout, how is the plan going?");
            const params = { workspaceId, threadId: started.thread.id };
            const turnsNow = asAlice.turns.listByThread({ params, query: { limit: 10 } });
            yield* until(turnsNow, () => models.requests.length === 1);
            // The sandbox goes while the model holds its answer: the harness server in it, and
            // its files.
            const sandboxes = join(directory, "sandboxes");
            yield* Effect.promise(() => Bun.spawn(["pkill", "-KILL", "-f", directory]).exited);
            yield* Effect.sync(() => {
              for (const entry of readdirSync(sandboxes))
                rmSync(join(sandboxes, entry), { recursive: true, force: true });
            });
            release.resolve();
            // The session ends with its server; the next attempt spawns a new sandbox and starts
            // the session again from the turn's log.
            yield* until(turnsNow, (turns) => turns[0]?.status === "completed");

            const timeline = yield* asAlice.threads.timeline({ params, query: { limit: 10 } });
            expect(texts(timeline)).toEqual([
              "Scout, how is the plan going?",
              "The plan is on track.",
            ]);
            expect(models.requests).toHaveLength(2);
            expect(JSON.stringify(models.requests[1])).toContain("Scout, how is the plan going?");
            expect(JSON.stringify(models.requests[1])).toContain(
              "Your sandbox was replaced with a new one, so files from earlier in this conversation are gone.",
            );
            expect(
              yield* until(
                Effect.sync(() => readdirSync(sandboxes)),
                (entries) => entries.length === 0,
              ),
            ).toEqual([]);
          }).pipe(Effect.provide(server(url, directory)));
        }).pipe(Effect.scoped),
      ),
    60_000,
  );

  it.live(
    "a turn whose host is killed continues from another host, which reattaches to its session",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const directory = yield* sandboxDirectory;
          const release = Promise.withResolvers<void>();
          const models = yield* fakeModels({
            hold: release.promise,
            answer: "The plan is on track.",
          });
          /** A host process over the database and the sandboxes, at its own runner address. */
          const host = <A>(port: number, run: Parameters<typeof withServer<A>>[1]) =>
            withServer(url, run, {
              env: {
                AMENDS_SANDBOX_DIRECTORY: directory,
                AMENDS_RUNNER_ADDRESS: `localhost:${port}`,
                AMENDS_RUNNER_TAKEOVER: "6 seconds",
              },
            });
          yield* Effect.promise(async () => {
            const asked = await host(34481, async (call, _base, stop) => {
              const body = async (...request: Parameters<typeof call>) =>
                (await call(...request)).body as { readonly id: string };
              const workspaceId = (await body(alice, "POST", "/workspaces", { name: "Studio" })).id;
              const base = `/workspaces/${workspaceId}`;
              const connection = await body(alice, "POST", `${base}/connections`, {
                name: "Local models",
                implementationId: "openai-compatible",
                settings: { baseUrl: models.baseUrl },
                authentication: "None",
              });
              const environment = await body(alice, "POST", `${base}/environments`, {
                name: "Sandboxed",
                harnessId: Environment.inProcessHarness,
                sandbox: {
                  providerId: "local",
                  harness: "in-sandbox",
                  connectionId: null,
                  template: null,
                  env: {},
                  setup: [],
                  retention: "destroy",
                },
              });
              const agent = (
                await call(alice, "POST", `${base}/agents`, {
                  name: "Scout",
                  instructions: "Answer in one sentence.",
                  model: { connectionId: connection.id, model: "fake-model", reasoning: null },
                  environmentId: environment.id,
                  roleId: BuiltinRoles.MemberId,
                })
              ).body as { readonly memberId: string };
              const started = (
                await call(alice, "POST", `${base}/groups/${Group.GeneralId}/threads`, {
                  text: "Scout, how is the plan going?",
                  mentions: [agent.memberId],
                })
              ).body as { readonly thread: { readonly id: string } };
              // The host dies while the harness server in the sandbox waits for the model.
              await poll(
                async () => models.requests.length,
                (count) => count === 1,
              );
              await stop("SIGKILL");
              return { base, threadId: started.thread.id };
            });
            // The session finishes with no host attached, and another host takes the turn over.
            release.resolve();
            await host(34482, async (call) => {
              const turns = await poll(
                async () =>
                  (
                    await call(
                      alice,
                      "GET",
                      `${asked.base}/threads/${asked.threadId}/turns?limit=10`,
                    )
                  ).body as ReadonlyArray<{ readonly status: string }>,
                (turns) => turns[0]?.status === "completed",
              );
              expect(turns).toHaveLength(1);
              const timeline = (
                await call(
                  alice,
                  "GET",
                  `${asked.base}/threads/${asked.threadId}/timeline?limit=10`,
                )
              ).body as ReadonlyArray<ThreadTimeline.Item>;
              expect(texts(timeline)).toEqual([
                "Scout, how is the plan going?",
                "The plan is on track.",
              ]);
              // It collected what the session reported: the model was asked once.
              expect(models.requests).toHaveLength(1);
              // Ending the turn stopped the harness server and destroyed the sandbox.
              expect(
                await poll(
                  async () => readdirSync(join(directory, "sandboxes")),
                  (entries) => entries.length === 0,
                ),
              ).toEqual([]);
            });
          });
        }).pipe(Effect.scoped),
      ),
    90_000,
  );
});

/**
 * Real Daytona sandboxes, when `AMENDS_TEST_DAYTONA=1` asks for them and `DAYTONA_API_KEY` is set:
 * they take minutes and cost money, so an ordinary run skips them.
 */
const daytona =
  process.env["AMENDS_TEST_DAYTONA"] === "1" && (process.env["DAYTONA_API_KEY"] ?? "") !== "";

/** A model connection to make, with its key, and the model an agent selects through it. */
interface ModelAccount {
  readonly name: string;
  readonly implementationId: string;
  readonly settings: Record<string, string>;
  readonly key: string;
  readonly model: string;
}

/** Anthropic's, with a key it refuses. */
const refusedAnthropic: ModelAccount = {
  name: "Anthropic",
  implementationId: "anthropic",
  settings: {},
  key: "sk-ant-not-a-real-key",
  model: "claude-haiku-4-5-20251001",
};

/**
 * A real model, for a reply: OpenRouter's through the OpenAI-compatible connection when
 * `OPENROUTER_API_KEY` is set, with `OPENROUTER_BASE_URL` and `OPENROUTER_MODEL`, or Anthropic's
 * when `ANTHROPIC_API_KEY` is.
 */
const realModel: ModelAccount | undefined = process.env["OPENROUTER_API_KEY"]
  ? {
      name: "OpenRouter",
      implementationId: "openai-compatible",
      settings: { baseUrl: process.env["OPENROUTER_BASE_URL"] || "https://openrouter.ai/api/v1" },
      key: process.env["OPENROUTER_API_KEY"],
      model: process.env["OPENROUTER_MODEL"] || "anthropic/claude-haiku-4.5",
    }
  : process.env["ANTHROPIC_API_KEY"]
    ? { ...refusedAnthropic, key: process.env["ANTHROPIC_API_KEY"] }
    : undefined;

/** The Daytona sandboxes labelled with this environment that are not destroyed or on their way. */
const daytonaSandboxes = (environmentId: string) =>
  Effect.promise(async () => {
    const found = [];
    for await (const sandbox of new Daytona().list({
      labels: { "amends-environment": environmentId },
    }))
      if (sandbox.state !== "destroyed" && sandbox.state !== "destroying") found.push(sandbox);
    return found;
  });

/** Delete what a failed run left in Daytona for this environment. */
const deleteDaytonaSandboxes = (environmentId: string) =>
  Effect.flatMap(daytonaSandboxes(environmentId), (sandboxes) =>
    Effect.promise(() => Promise.all(sandboxes.map((sandbox) => sandbox.delete().catch(() => {})))),
  );

/**
 * Ask Scout, whose environment runs amends's harness inside a Daytona sandbox under the workspace's
 * Daytona account, with the model `account` gives. Waits for the turn to end and for the
 * environment's retention to destroy the sandbox, then says how the turn ended, the thread's
 * messages, and the sandboxes left. Whatever a failed run leaves in Daytona is deleted.
 */
const askOnDaytona = (url: string, account: ModelAccount, question: string) =>
  Effect.gen(function* () {
    const directory = yield* sandboxDirectory;
    const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))));
    let environmentId: string | undefined;
    return yield* Effect.gen(function* () {
      const asAlice = yield* client(alice);
      const { id: workspaceId } = yield* asAlice.workspaces.create({
        headers: {},
        payload: { name: "Studio" },
      });
      /** A connection with its key. */
      const connect = (
        name: string,
        implementationId: string,
        settings: Record<string, string>,
        secret: string,
      ) =>
        Effect.gen(function* () {
          const connection = yield* asAlice.connections.create({
            params: { workspaceId },
            headers: {},
            payload: {
              name,
              implementationId: ConnectionImplementation.Id.make(implementationId),
              settings,
              authentication: "ApiKey",
            },
          });
          yield* asAlice.connections.setCredential({
            params: { workspaceId, connectionId: connection.id },
            payload: { secret: Redacted.make(secret) },
          });
          return connection;
        });
      const models = yield* connect(
        account.name,
        account.implementationId,
        account.settings,
        account.key,
      );
      const daytonaAccount = yield* connect(
        "Daytona",
        "daytona",
        {},
        process.env["DAYTONA_API_KEY"]!,
      );
      const environment = yield* asAlice.environments.create({
        params: { workspaceId },
        headers: {},
        payload: {
          name: "Daytona",
          harnessId: Environment.inProcessHarness,
          sandbox: {
            providerId: SandboxImplementation.Id.make("daytona"),
            harness: "in-sandbox",
            connectionId: daytonaAccount.id,
            template: null,
            env: {},
            setup: [],
            retention: "destroy",
          },
        },
      });
      environmentId = environment.id;
      const agent = yield* asAlice.agents.create({
        params: { workspaceId },
        headers: {},
        payload: {
          name: "Scout",
          instructions: "Answer in one short sentence.",
          model: { connectionId: models.id, model: account.model, reasoning: null },
          environmentId: environment.id,
          roleId: BuiltinRoles.MemberId,
        },
      });
      const started = yield* asAlice.threads.start({
        params: { workspaceId, groupId: Group.GeneralId },
        headers: {},
        payload: { text: question, mentions: [agent.memberId] },
      });
      const params = { workspaceId, threadId: started.thread.id };
      // The turn spawns a Daytona sandbox under the workspace's account, uploads the harness
      // server, and runs amends's harness there, which asks Anthropic.
      const [turn] = yield* asAlice.turns.listByThread({ params, query: { limit: 10 } }).pipe(
        Effect.repeat({
          until: (turns) =>
            turns[0] !== undefined && !["queued", "running"].includes(turns[0].status),
          schedule: Schedule.spaced("1 second"),
          times: 300,
        }),
      );
      const timeline = yield* asAlice.threads.timeline({ params, query: { limit: 10 } });
      const left = yield* until(daytonaSandboxes(environment.id), (found) => found.length === 0);
      return { turn, messages: texts(timeline), left: left.map((sandbox) => sandbox.id) };
    }).pipe(
      Effect.provide(server(url, directory, credentialKey)),
      Effect.ensuring(
        Effect.suspend(() =>
          environmentId === undefined
            ? Effect.void
            : Effect.ignore(deleteDaytonaSandboxes(environmentId)),
        ),
      ),
    );
  }).pipe(Effect.scoped);

describe.skipIf(!available || !daytona)("PostgreSQL with Daytona", () => {
  it.live(
    "a turn on Daytona whose model refuses its key fails, and its sandbox is destroyed",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const asked = yield* askOnDaytona(url, refusedAnthropic, "Scout, are you there?");
          // The harness inside the sandbox asked Anthropic, which refused the key.
          expect(asked.turn).toMatchObject({
            status: "failed",
            failure: "Anthropic didn't accept its API key.",
          });
          expect(asked.left).toEqual([]);
        }),
      ),
    600_000,
  );

  it.live.skipIf(realModel === undefined)(
    "an agent whose harness runs inside a Daytona sandbox replies with a real model",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const asked = yield* askOnDaytona(url, realModel!, "Scout, what is two plus two?");
          expect(asked.turn).toMatchObject({ status: "completed", failure: null });
          expect(asked.messages[0]).toBe("Scout, what is two plus two?");
          expect(asked.messages[1]).toMatch(/4|four/i);
          expect(asked.left).toEqual([]);
        }),
      ),
    600_000,
  );
});
