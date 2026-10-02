import {
  Api,
  Authentication,
  ConnectionImplementation,
  Environment,
  type ThreadTimeline,
  Turn,
} from "@amends/api-http";

import { BuiltinRoles } from "@amends/core/authorization";
import { Group } from "@amends/core/group";
import { Identity } from "@amends/core/identity";
import { describe, expect, it } from "@effect/vitest";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { Effect, Fiber, Layer, Redacted, Schedule, Stream } from "effect";
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

/** Alice's workspace with Scout, an agent whose model connection is the fake provider. */
const workspaceWithScout = (baseUrl: string) =>
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
});
