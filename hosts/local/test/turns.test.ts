import { Api, Authentication } from "@amends-dev/http";
import { BuiltinRoles } from "@amends-dev/core/authorization";
import { Group } from "@amends-dev/core/group";
import { Identity } from "@amends-dev/core/identity";
import type { Thread } from "@amends-dev/core/thread";
import type { Member, Workspace } from "@amends-dev/core/workspace";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer, Redacted, Schedule } from "effect";
import { Base64 } from "effect/encoding";
import { HttpClientRequest, HttpRouter } from "effect/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/http-api";
import * as DevelopmentAuthentication from "../src/DevelopmentAuthentication.ts";
import * as LocalHost from "../src/LocalHost.ts";
import * as LocalServer from "../src/LocalServer.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication.Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api.Api).pipe(Effect.provide(asToken(token)));
const credentialKey = Redacted.make(Base64.encode(crypto.getRandomValues(new Uint8Array(32))));
/**
 * The real routes, gateway, PostgreSQL storage, and turn jobs on Cluster behind a Bun test server,
 * reading for due job requests every tenth of a second.
 */
const server = (url: string) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      DevelopmentAuthentication.layer(() => Effect.void).pipe(
        Layer.provide(BunCrypto.layer),
        Layer.provideMerge(
          LocalHost.layer(Redacted.make(url), { credentialKey, pollInterval: "100 millis" }),
        ),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );

/** A message as a model is sent it: its role, and its text. */
interface Sent {
  readonly role: string;
  readonly text: string;
}

/**
 * A model provider speaking OpenAI's chat completions, which answers each request with the next of
 * `answers`, repeating the last, once `release` resolves, and keeps each request's messages.
 */
const fakeModels = (answers: ReadonlyArray<string>, release: Promise<void> = Promise.resolve()) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const requests: Array<ReadonlyArray<Sent>> = [];
      const chunk = (choice: object, extra: object = {}) =>
        `data: ${JSON.stringify({ id: "c1", model: "fake-model", created: 0, choices: [choice], ...extra })}\n\n`;
      const models = Bun.serve({
        port: 0,
        fetch: async (request) => {
          if (!new URL(request.url).pathname.endsWith("/chat/completions"))
            return new Response("Not found", { status: 404 });
          const body = (await request.json()) as {
            readonly messages: ReadonlyArray<{ readonly role: string; readonly content: unknown }>;
          };
          requests.push(
            body.messages.map(({ role, content }) => ({
              role,
              text:
                typeof content === "string"
                  ? content
                  : (content as ReadonlyArray<{ readonly text?: string }>)
                      .map((part) => part.text ?? "")
                      .join("\n"),
            })),
          );
          await release;
          const answer = answers[Math.min(requests.length, answers.length) - 1]!;
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
    (models) => Effect.promise(() => models.stop()),
  );

/**
 * Alice's workspace, where she is called Alice, with Planner, an agent on amends's own harness and a model the provider at
 * `modelsUrl` serves, which works without a sandbox.
 */
const workspaceWithAgent = (modelsUrl: string) =>
  Effect.gen(function* () {
    const asAlice = yield* client(alice);
    const { id: workspaceId } = yield* asAlice.workspaces.create({
      headers: {},
      payload: { name: "Studio", memberName: "Alice" },
    });
    const connect = (integration: string, settings: Record<string, string> = {}) =>
      asAlice.connections.create({
        params: { workspaceId },
        headers: {},
        payload: { integration, name: integration, settings, auth: "none" },
      });
    const amends = yield* connect("amends");
    const models = yield* connect("openai-compatible", { url: modelsUrl });
    const agent = yield* asAlice.agents.create({
      params: { workspaceId },
      headers: {},
      payload: {
        name: "Planner",
        roleId: BuiltinRoles.MemberId,
        instructions: "Plan each change.",
        harness: { _tag: "Connection", connectionId: amends.id },
        model: { connectionId: models.id, id: "fake-model" },
        sandbox: null,
      },
    });
    return { asAlice, workspaceId, agent };
  });

type Client = Effect.Success<ReturnType<typeof client>>;

/** The thread's messages the agent `memberId` posted, once it posted `count`, read every 100 ms. */
const agentMessages = (
  asAlice: Client,
  params: { readonly workspaceId: Workspace.Id; readonly threadId: Thread.Id },
  memberId: Member.Id,
  count: number,
) =>
  asAlice.threads.timeline({ params, query: { limit: 50 } }).pipe(
    Effect.map((timeline) =>
      timeline.flatMap((item) =>
        "message" in item &&
        item.message.author._tag === "Member" &&
        item.message.author.memberId === memberId
          ? [item.message]
          : [],
      ),
    ),
    Effect.repeat({
      until: (messages) => messages.length >= count,
      schedule: Schedule.spaced("100 millis"),
    }),
    Effect.timeout("20 seconds"),
  );

const { available, withDatabase } = setup();
describe.skipIf(!available)("turns on the local host", () => {
  it.live(
    "an agent asked in a thread answers there, and its next turn resumes the conversation",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const models = yield* fakeModels(["The plan is on track.", "The risks are small."]);
          const { asAlice, workspaceId, agent } = yield* workspaceWithAgent(models.baseUrl);
          const started = yield* asAlice.threads.start({
            params: { workspaceId, groupId: Group.GeneralId },
            headers: {},
            payload: { text: "Planner, summarize the plan.", mentions: [agent.memberId] },
          });
          const params = { workspaceId, threadId: started.thread.id };

          // The mention runs the agent's turn job, which posts its answer as the agent.
          const [answer] = yield* agentMessages(asAlice, params, agent.memberId, 1);
          expect(answer?.content).toMatchObject({ text: "The plan is on track." });
          expect(models.requests[0]).toEqual([
            { role: "system", text: "Plan each change." },
            { role: "user", text: "Alice: Planner, summarize the plan." },
          ]);
          if (answer?.via?._tag !== "Turn") return yield* Effect.die("Expected an agent's reply");
          const turn = yield* asAlice.turns.get({
            params: { workspaceId, turnId: answer.via.turnId },
          });
          expect(turn).toMatchObject({ status: "completed", messageIds: [answer!.id] });

          // Asked again, the agent resumes its session with the conversation its log records.
          yield* asAlice.threads.publish({
            params,
            headers: {},
            payload: { text: "Planner, and the risks?", mentions: [agent.memberId] },
          });
          const answers = yield* agentMessages(asAlice, params, agent.memberId, 2);
          expect(answers.map(({ content }) => ("text" in content ? content.text : null))).toEqual([
            "The plan is on track.",
            "The risks are small.",
          ]);
          expect(models.requests[1]).toEqual([
            { role: "system", text: "Plan each change." },
            { role: "user", text: "Alice: Planner, summarize the plan." },
            { role: "assistant", text: "The plan is on track." },
            { role: "user", text: "Alice: Planner, and the risks?" },
          ]);
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    60_000,
  );

  it.live("a turn asked to stop stops while its model answers, posting nothing", () =>
    withDatabase((url) =>
      Effect.gen(function* () {
        const released = Promise.withResolvers<void>();
        yield* Effect.addFinalizer(() => Effect.sync(() => released.resolve()));
        const models = yield* fakeModels(["Too late."], released.promise);
        const { asAlice, workspaceId, agent } = yield* workspaceWithAgent(models.baseUrl);
        const started = yield* asAlice.threads.start({
          params: { workspaceId, groupId: Group.GeneralId },
          headers: {},
          payload: { text: "Planner, draft the notes.", mentions: [agent.memberId] },
        });
        // The turn runs once its model has the request.
        yield* Effect.sync(() => models.requests.length).pipe(
          Effect.repeat({ until: (count) => count > 0, schedule: Schedule.spaced("50 millis") }),
          Effect.timeout("20 seconds"),
        );
        const [running] = yield* asAlice.turns.listActive({
          params: { workspaceId },
          query: { limit: 10 },
        });
        expect(running).toMatchObject({ status: "running", stoppable: true });
        yield* asAlice.turns.cancel({ params: { workspaceId, turnId: running!.id } });
        const stopped = yield* asAlice.turns
          .get({ params: { workspaceId, turnId: running!.id } })
          .pipe(
            Effect.repeat({
              until: ({ status }) => status === "cancelled",
              schedule: Schedule.spaced("100 millis"),
            }),
            Effect.timeout("20 seconds"),
          );
        expect(stopped).toMatchObject({ cancelReason: "requested", messageIds: [] });
        released.resolve();
        const timeline = yield* asAlice.threads.timeline({
          params: { workspaceId, threadId: started.thread.id },
          query: { limit: 50 },
        });
        expect(timeline.filter((item) => "message" in item)).toHaveLength(1);
      }).pipe(Effect.scoped, Effect.provide(server(url))),
    ),
  );
});
