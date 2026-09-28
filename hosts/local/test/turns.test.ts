import { Api, Authentication, ConnectionImplementation, Environment } from "@amends/api-http";
import type { ThreadTimeline } from "@amends/api-http";
import { BuiltinRoles } from "@amends/core/authorization";
import { Group } from "@amends/core/group";
import { Identity } from "@amends/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer, Redacted, Schedule } from "effect";
import { HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { DevelopmentAuthentication } from "../src/authentication/authentication.ts";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/server.ts";
import { setup } from "./database.ts";

const alice = Identity.HumanId.make("alice");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
const client = (token: string) => HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
/** The real routes, gateway, PostgreSQL storage, and turn runner behind a Bun test server. */
const server = (url: string) =>
  HttpRouter.serve(LocalServer.layerRoutes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(Redacted.make(url), { pollInterval: "100 millis" }),
        DevelopmentAuthentication.layer(() => Effect.void).pipe(Layer.provide(BunCrypto.layer)),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );

/**
 * A model provider speaking OpenAI's chat completions, which streams `answer` to every request
 * and keeps each request's messages.
 */
const fakeModels = (answer: string) =>
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

const texts = (items: ReadonlyArray<ThreadTimeline.Item>) =>
  items.flatMap((item) => ("message" in item ? [item.message.text] : []));

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.live(
    "an agent asked in a thread runs a turn with its model and replies there",
    () =>
      withDatabase((url) =>
        Effect.gen(function* () {
          const models = yield* fakeModels("The plan is on track.");
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
              settings: { baseUrl: models.baseUrl },
              authentication: "None",
            },
          });
          const agent = yield* asAlice.agents.create({
            params: { workspaceId },
            headers: {},
            payload: {
              name: "Scout",
              instructions: "Answer in one sentence.",
              model: { connectionId: connection.id, model: "fake-model", reasoning: null },
              environmentId: Environment.InProcessId,
              roleId: BuiltinRoles.MemberId,
            },
          });

          const started = yield* asAlice.threads.start({
            params: { workspaceId, groupId: Group.GeneralId },
            headers: {},
            payload: { text: "Scout, how is the plan going?", mentions: [agent.memberId] },
          });
          const threadId = started.thread.id;
          // The agent accepts the mention in the background, and its turn runs on the host's
          // cluster, closing with the reply.
          const timeline = yield* asAlice.threads
            .timeline({ params: { workspaceId, threadId }, query: { limit: 10 } })
            .pipe(
              Effect.repeat({
                until: (items) => texts(items).length === 2,
                schedule: Schedule.spaced("200 millis"),
                times: 100,
              }),
            );

          expect(texts(timeline)).toEqual([
            "Scout, how is the plan going?",
            "The plan is on track.",
          ]);
          expect(timeline.at(-1)).toMatchObject({
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
        }).pipe(Effect.scoped, Effect.provide(server(url))),
      ),
    30_000,
  );
});
