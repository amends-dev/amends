import { Api, Authentication } from "@amends-dev/api-http";
import type * as Core from "@amends-dev/core";
import { ChangeFeed, ChangeFeedService } from "@amends-dev/core/change-feed";
import { Actor, Identity } from "@amends-dev/core/identity";
import { Member, Workspace } from "@amends-dev/core/workspace";
import { SessionTokens, Gateway, type GatewayErrors } from "@amends-dev/gateway";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Logger, Option, Stream } from "effect";
import type { Scope } from "effect";
import { HttpClientRequest, HttpServer } from "effect/http";
import { HttpApiMiddleware, HttpApiTest } from "effect/http-api";
import { BearerAuthentication, ChangeFeedHandlers } from "../src/index.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const workspaceId = Workspace.Id.make("workspace-one");
const actor = Actor.Actor.of({
  workspaceId,
  memberId: Member.Id.make("member-one"),
  identity: alice,
});
const secret = "connect ECONNREFUSED 10.0.0.5:5432 password=hunter2";

/** A change feed that opens, then fails in a way no client should learn the details of. */
const failing = Layer.succeed(
  ChangeFeedService.ChangeFeedService,
  ChangeFeedService.ChangeFeedService.of({
    watch: () =>
      Effect.succeed(
        Stream.make(
          ChangeFeed.Message.cases.Ready.make({ workspaceId, cursor: null, reset: true }),
        ).pipe(Stream.concat(Stream.die(new Error(secret)))),
      ),
  }),
);
const gateway = Layer.succeed(
  Gateway.Gateway,
  Gateway.Gateway.of({
    inWorkspace: () => Effect.die("unused"),
    createWorkspace: () => Effect.die("unused"),
    asMember: <A, E>(
      _id: Workspace.Id,
      _identity: Identity.MemberReference,
      program: Effect.Effect<A, E, Core.Operations | Actor.Actor | Scope.Scope>,
    ) =>
      Effect.provide(Effect.provideService(program, Actor.Actor, actor), failing) as Effect.Effect<
        A,
        GatewayErrors.PublicErrorOf<E> | GatewayErrors.NotMember,
        Scope.Scope
      >,
  }),
);
const credentials = Layer.succeed(
  SessionTokens.SessionTokens,
  SessionTokens.SessionTokens.of({
    resolve: () => Effect.succeed(alice),
    revoke: () => Effect.void,
  }),
);
const client = HttpApiTest.groups(Api, ["changeFeed"]).pipe(
  Effect.provide(
    Layer.mergeAll(
      ChangeFeedHandlers.layer.pipe(
        Layer.provideMerge(BearerAuthentication.layer),
        Layer.provide(Layer.mergeAll(gateway, credentials)),
      ),
      HttpServer.layerServices,
      HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
        next(HttpClientRequest.bearerToken(request, "alice")),
      ),
    ),
  ),
);

it.effect(
  "a change stream that fails unexpectedly is logged, and its client told only to reconnect",
  () =>
    Effect.gen(function* () {
      const logged: Array<Logger.Options<unknown>> = [];
      const messages: Array<ChangeFeed.Message> = [];
      const exit = yield* Effect.gen(function* () {
        const api = yield* client;
        const stream = yield* api.changeFeed.watch({ params: { workspaceId }, query: {} });
        return yield* Stream.runForEach(stream, (message) =>
          Effect.sync(() => messages.push(message)),
        );
      }).pipe(
        Effect.scoped,
        Effect.exit,
        Effect.provide(Logger.layer([Logger.make((options) => void logged.push(options))])),
      );
      expect(messages.map((message) => message._tag)).toEqual(["Ready"]);
      expect(Exit.isFailure(exit) && Exit.findErrorOption(exit)).toEqual(
        Option.some(new ChangeFeed.Unavailable({})),
      );
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(false);
      expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).not.toContain("hunter2");
      // The host keeps the cause for its logs.
      expect(
        logged.filter(
          ({ logLevel, cause }) => logLevel === "Error" && Cause.pretty(cause).includes("hunter2"),
        ),
      ).toHaveLength(1);
    }),
);
